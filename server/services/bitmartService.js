const axios = require('axios');
const crypto = require('crypto');

// Función auxiliar para ordenar las claves de un objeto JSON alfabéticamente
// Esto es CRÍTICO para la firma de BitMart, especialmente en POST requests
function sortObjectKeys(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
    }
    const sortedKeys = Object.keys(obj).sort();
    const sortedObj = {};
    for (const key of sortedKeys) {
        sortedObj[key] = sortObjectKeys(obj[key]);
    }
    return sortedObj;
}

// Función para generar la firma V2 de BitMart
// https://developer-pro.bitmart.com/en/developer/changelog/
async function generateSignature(secretKey, method, requestPath, timestamp, memo, queryString) {
    // En BitMart V2, el queryString para POST requests es el body JSON stringificado y ordenado
    const message = `${timestamp}#${memo}#${method}#${requestPath}#${queryString}`;
   // console.log(`[SIGN_DEBUG] Message to Hash: '${message}' (Length: ${message.length})`);
   // console.log(`[SIGN_DEBUG] API Secret (partial for hash): ${secretKey.substring(0, 5)}...${secretKey.substring(secretKey.length - 5)} (Length: ${secretKey.length})`);

    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(message);
    return hmac.digest('hex');
}

// Función para obtener la hora del servidor de BitMart
async function getBitmartServerTime() {
    try {
        const response = await axios.get('https://api-cloud.bitmart.com/system/time', {
            headers: {
                'User-Agent': 'axios/1.9.0', // Asegura un User-Agent consistente
                'Accept': 'application/json, text/plain, */*',
                'X-BM-SIGN-TYPE': '2' // Indica que es una solicitud v2
            }
        });
        console.log('✅ Hora del servidor BitMart obtenida: %s (%s)', response.data.data.server_time, new Date(parseInt(response.data.data.server_time)).toISOString());
        return response.data.data.server_time;
    } catch (error) {
        console.error('❌ Error al obtener la hora del servidor de BitMart:', error.message);
        throw new Error(`Error al obtener la hora del servidor de BitMart: ${error.message}`);
    }
}

// Función genérica para hacer solicitudes a la API de BitMart
async function makeRequest(authCredentials, method, path, queryParams = {}, requestBody = {}) {
    const { apiKey, secretKey, apiMemo } = authCredentials;

    if (!apiKey || !secretKey) {
        throw new Error('BitMart API Key y Secret Key son requeridos.');
    }
    // console.log(`[API_CRED_DEBUG] API Key (used for request): '${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 5)}' (Length: ${apiKey.length})`);
    // console.log(`[API_CRED_DEBUG] Secret Key (used for signing): '${secretKey.substring(0, 5)}...${secretKey.substring(secretKey.length - 5)}' (Length: ${secretKey.length})`);
    // console.log(`[API_CRED_DEBUG] API Memo (used for request & signing): '${apiMemo}' (Type: ${typeof apiMemo}, Length: ${apiMemo ? apiMemo.length : 0})`);
    // if (apiMemo) console.log(`[API_CRED_DEBUG] API Memo (raw characters): [${Array.from(apiMemo).map(char => 'U+' + char.charCodeAt(0).toString(16).padStart(4, '0')).join(', ')}]`);

    // BitMart v4 endpoints are usually /api/v4/xxx, v2/v1 are /api/v2/xxx or /api/v1/xxx
    const isV4Endpoint = path.includes('/v4/');

    // Obtener la hora del servidor para la firma
    const timestamp = await getBitmartServerTime();

    let queryStringForSignature = '';
    let url = `https://api-cloud.bitmart.com${path}`;
    const recvWindow = 10000; // Define recvWindow

    const headers = {
        'User-Agent': 'axios/1.9.0',
        'Accept': 'application/json, text/plain, */*',
        'X-BM-SIGN-TYPE': '2', // Usar siempre 2 para V2 (recomendado)
        'X-BM-RECVWINDOW': recvWindow,
        'X-BM-KEY': apiKey,
        'X-BM-TIMESTAMP': timestamp,
    };

    console.log(`[DEBUG_HEADER] Path: ${path}, isV4Endpoint: ${isV4Endpoint}, apiMemoForRequestAndSign: '${apiMemo}'`);

    // Construcción del queryString para la firma y de la URL final
    if (method === 'GET' || method === 'DELETE') {
        const sortedQueryParams = sortObjectKeys(queryParams);
        const queryStringArray = Object.keys(sortedQueryParams)
            .map(key => `${key}=${sortedQueryParams[key]}`);
        if (queryStringArray.length > 0) {
            queryStringForSignature = queryStringArray.join('&');
            url += `?${queryStringForSignature}`;
        }
    } else if (method === 'POST' || method === 'PUT') {
        // Para POST/PUT, el body se usa para la firma
        // Asegúrate de que el requestBody se ordene antes de stringificarlo para la firma
        const sortedRequestBody = sortObjectKeys(requestBody);
        queryStringForSignature = JSON.stringify(sortedRequestBody);
        headers['Content-Type'] = 'application/json'; // Importante para POST/PUT JSON
        console.log('DEBUG: requestBody antes de makeRequest:', requestBody);
    }

    // Generate the signature
    const signature = await generateSignature(secretKey, method, path, timestamp, apiMemo, queryStringForSignature);
    headers['X-BM-SIGN'] = signature;

    // Si es una ruta V1/V2 y tenemos memo, BitMart NO quiere el header X-BM-MEMO
    if (!isV4Endpoint && apiMemo) {
         console.log('[DEBUG_HEADER] X-BM-MEMO DELETED or not added (V1/V2 or no memo).');
        // delete headers['X-BM-MEMO']; // Asegúrate de que no se envía
    } else if (isV4Endpoint && apiMemo) {
        // Para V4, el memo SÍ va en el header
        headers['X-BM-MEMO'] = apiMemo;
        console.log('[DEBUG_HEADER] X-BM-MEMO ADDED for V4 endpoint.');
    }


    // Depuración de la solicitud
    console.log(`\n--- Realizando solicitud ${method} a ${path} ---`);
    console.log('URL:', url);
    if (method === 'GET' || method === 'DELETE') {
        console.log('Query Params (para solicitud y firma, ordenados):', queryParams);
    } else {
        console.log('Body enviado (para solicitud):', requestBody);
        console.log('Body para Firma (JSON stringificado, ordenado):', queryStringForSignature);
    }
    console.log('Headers enviados:', headers);


    try {
        const axiosConfig = {
            method,
            url,
            headers,
            // Si es POST o PUT, el body va aquí
            data: (method === 'POST' || method === 'PUT') ? requestBody : undefined,
            params: (method === 'GET' || method === 'DELETE') ? queryParams : undefined,
        };

        const response = await axios(axiosConfig);

        if (response.data.code !== 1000) {
            console.error(`❌ Solicitud a ${path} exitosa pero con código de error de BitMart: ${response.data.code}, Mensaje: ${response.data.message}`);
            throw new Error(`Error de la API de BitMart: ${JSON.stringify(response.data)}`);
        }
        return response.data;
    } catch (error) {
        console.error(`❌ Falló la solicitud a ${path}.`);
        if (error.response) {
            console.error('Error Data:', error.response.data);
            console.error('Error Status:', error.response.status);
            console.error('Error Headers:', error.response.headers);
            throw new Error(`Error de la API de BitMart: ${JSON.stringify(error.response.data)} (Status: ${error.response.status})`);
        } else if (error.request) {
            console.error('No se recibió respuesta:', error.request);
            throw new Error(`No se recibió respuesta del servidor de BitMart al solicitar ${path}.`);
        } else {
            console.error('Error al configurar la solicitud:', error.message);
            throw new Error(`Error al configurar la solicitud BitMart para ${path}: ${error.message}`);
        }
    }
}

// --- Funciones de la API de BitMart ---

exports.getBalance = async (authCredentials) => {
    console.log('\n--- Obteniendo Balance de la Cuenta ---');
    const response = await makeRequest(authCredentials, 'GET', '/account/v1/wallet');
   // console.log('DEBUG: BitMart wallet raw response.data:', response.data);
    return response.data.wallet;
};


exports.getKlines = async (authCredentials, symbol, interval, startTime, endTime, limit) => {
    console.log(`\n--- Obteniendo Velas (Klines) para ${symbol} ---`);
    const queryParams = {
        symbol,
        step: interval, // BitMart usa 'step' para el intervalo
        from: startTime,
        to: endTime,
        limit
    };
    const response = await makeRequest(authCredentials, 'GET', '/spot/v4/user-open-orders', queryParams);
    // BitMart devuelve un array donde cada elemento es [timestamp, open, high, low, close, volume]
    // Mapear esto a un formato más legible si es necesario, o úsalo directamente.
    // Para este bot, asumimos que el array tal cual es suficiente para el análisis.
    if (response.data && response.data.candles) {
         const candles = response.data.candles.map(c => ({
            timestamp: parseInt(c[0]), // Asegura que sea número
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5])
        }));
        console.log(`✅ Klines (Candlesticks) para ${symbol} obtenidos con éxito.`);
        return candles;
    }
    console.log(`❌ No se encontraron velas para ${symbol}.`);
    return [];
};


exports.placeOrder = async (authCredentials, symbol, side, type, amount, price) => {
    console.log(`\n--- Colocando Orden ${side.toUpperCase()} de ${amount} ${symbol} (${type}) ---`);

    let requestBody = {
        symbol: symbol,
        side: side,
        type: type,
        // open_type: 'cash', // Agregado según la documentación de BitMart V2 para spot trading
        client_oid: `oid_${Date.now()}` // Un ID único para la orden
    };

    if (type === 'limit') {
        if (!price) throw new Error('El precio es requerido para órdenes límite.');
        requestBody.price = String(price); // Asegura que el precio sea un string
        requestBody.size = String(amount); // Asegura que la cantidad sea un string
    } else if (type === 'market') {
        if (side === 'buy') {
            // Para órdenes de compra a mercado (BUY), BitMart usa 'notional' (cantidad en USD/USDT)
            // y NO 'size' (cantidad en BTC/ETH).
            requestBody.notional = String(amount); // Asegura que sea un string
            console.log(`[DEBUG_BITMART_SERVICE] placeOrder - symbol: ${symbol}, side: ${side}, type: ${type}, amount: ${amount}, price: ${price}`);

        } else if (side === 'sell') {
            // Para órdenes de venta a mercado (SELL), BitMart usa 'size' (cantidad en BTC/ETH)
            requestBody.size = String(amount); // Asegura que sea un string
        }
    } else {
        throw new Error('Tipo de orden no soportado. Usa "limit" o "market".');
    }

    // Agregar open_type para todas las órdenes Spot V2
    requestBody.open_type = 'cash'; // Importante para órdenes al contado

    console.log('DEBUG: requestBody antes de makeRequest:', requestBody);

    const response = await makeRequest(authCredentials, 'POST', '/spot/v2/submit_order', {}, requestBody);
    console.log('✅ Orden colocada con éxito:', response.data);
    return response.data;
};


exports.getOpenOrders = async (authCredentials, symbol) => {
    console.log(`\n--- Obteniendo Órdenes Abiertas para ${symbol || 'todos los símbolos'} ---`);
    const queryParams = symbol ? { symbol } : {}; // Si se especifica un símbolo, se añade a los parámetros
    const response = await makeRequest(authCredentials, 'GET', '/spot/v4/user-open-orders', queryParams);
// ...

    if (response.data && response.data.orders) {
        console.log('✅ Órdenes abiertas obtenidas con éxito.');
        return response.data.orders;
    }
    console.log('❌ No se encontraron órdenes abiertas.');
    return [];
};


exports.getHistoryOrdersV4 = async (authCredentials, { symbol, orderMode, startTime, endTime, limit }) => {
    console.log(`\n--- Obteniendo Historial de Órdenes para ${symbol || 'todos los símbolos'} ---`);

    // BitMart V4 endpoints are like /spot/v4/history-orders or /account/v4/xxx
    const path = '/spot/v4/query-user-order-history';

    const queryParams = {
        symbol, // Obligatorio para BitMart, incluso si el bot lo maneja
    };

    // orderMode no es un parámetro directo en BitMart V2 history-orders
    // BitMart V2 (GET /spot/v2/history-orders) ya devuelve todas las órdenes terminadas.
    // Si necesitas filtrar por estado (filled, cancelled), eso se haría en el frontend
    // o después de obtener todos los datos.
    // Para V2, se asume que esta ruta ya da un historial "completo" de órdenes no abiertas.

    if (startTime) queryParams.start_time = startTime;
    if (endTime) queryParams.end_time = endTime;
    if (limit) queryParams.limit = limit;

    const response = await makeRequest(authCredentials, 'GET', path, queryParams);

    if (response.data && response.data.orders) {
        console.log('✅ Historial de órdenes obtenido con éxito.');
        return response.data.orders;
    }
    console.log('❌ No se encontró historial de órdenes.');
    return [];
};


// Función para obtener las estadísticas del trading (por ejemplo, volumen de 24h)
exports.getTicker = async (symbol) => {
    console.log(`\n--- Obteniendo Ticker para ${symbol} ---`);
    try {
        // El ticker es una API pública, no requiere autenticación
        const response = await axios.get(`https://api-cloud.bitmart.com/spot/v1/ticker?symbol=${symbol}`, {
            headers: {
                'User-Agent': 'axios/1.9.0',
                'Accept': 'application/json, text/plain, */*',
            }
        });
        if (response.data.code === 1000 && response.data.data && response.data.data.tickers.length > 0) {
            console.log(`✅ Ticker para ${symbol} obtenido con éxito. Último precio: ${response.data.data.tickers[0].last_price}`);
            return response.data.data.tickers[0];
        }
        console.error(`❌ No se pudo obtener el ticker para ${symbol}. Respuesta:`, response.data);
        return null;
    } catch (error) {
        console.error(`❌ Error al obtener el ticker para ${symbol}:`, error.message);
        if (error.response) {
            console.error('Error Details:', error.response.data);
        }
        throw new Error(`Error al obtener el ticker para ${symbol}.`);
    }
};