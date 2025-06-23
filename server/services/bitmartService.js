// server/services/bitmartService.js

const axios = require('axios');
const crypto = require('crypto');
const API_BASE_URL = 'https://api-cloud.bitmart.com'; // O 'https://api-cloud.bitmart.info' para producción si cambias de dominio
const DEFAULT_RECV_WINDOW = 10000;
// No usaremos un DEFAULT_V4_POST_MEMO si la intención es que el usuario maneje su propio memo.
// const DEFAULT_V4_POST_MEMO = 'GainBot'; 

// --- Funciones de Ayuda ---
const signMessage = (secretKey, timestamp, memo, queryStringOrBody) => {
    // Si memo es nulo/vacío, se usa un string vacío para la firma.
    // BitMart requiere memo siempre en el hash para V4 incluso si está vacío.
    const memoForHash = memo === null || memo === undefined ? '' : memo;
    const message = `${timestamp}#${memoForHash}#${queryStringOrBody}`;
    
    // Logs de depuración para la firma
    console.log(`[SIGN_DEBUG] Timestamp: '${timestamp}'`);
    console.log(`[SIGN_DEBUG] Memo used for hash: '${memoForHash}' (Original memo value: ${memo})`);
    console.log(`[SIGN_DEBUG] Body/Query String for Sign: '${queryStringOrBody}' (Length: ${queryStringOrBody.length})`);
    console.log(`[SIGN_DEBUG] Message to Hash: '${message}' (Length: ${message.length})`);
    console.log(`[SIGN_DEBUG] API Secret (partial for hash): ${secretKey.substring(0, 5)}...${secretKey.substring(secretKey.length - 5)} (Length: ${secretKey.length})`);

    const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
    return signature;
};

// Función para obtener la hora del servidor de BitMart (API pública)
const getBitmartServerTime = async () => {
    console.log('\n--- Obteniendo Hora del Servidor BitMart (Público) ---');
    try {
        const url = `${API_BASE_URL}/system/time`;
        console.log(`--- Realizando solicitud GET a ${url.split(API_BASE_URL)[1]} ---`);
        console.log(`URL: ${url}`);
        const requestConfig = {
            headers: {
                'User-Agent': 'axios/1.9.0',
                'Accept': 'application/json, text/plain, */*',
            },
            params: {} // No query params for /system/time
        };
        console.log(`Query Params (para solicitud y firma, ordenados): ${JSON.stringify(requestConfig.params)}`);
        console.log(`Headers enviados: ${JSON.stringify(requestConfig.headers, null, 2)}`);

        const response = await axios.get(url, requestConfig);
        if (response.data && response.data.code === 1000 && response.data.data && response.data.data.server_time) {
            const serverTime = response.data.data.server_time;
            console.log(`✅ Hora del servidor BitMart obtenida: ${serverTime} (${new Date(parseInt(serverTime)).toISOString()})`);
            return serverTime;
        } else {
            console.error('❌ Error al obtener la hora del servidor BitMart:', JSON.stringify(response.data));
            throw new Error('Failed to get BitMart server time');
        }
    } catch (error) {
        console.error('❌ Error en getBitmartServerTime:', error.message);
        throw new Error(`Error fetching BitMart server time: ${error.message}`);
    }
};


// Función principal para realizar solicitudes autenticadas a la API de BitMart
const makeRequest = async (method, path, data = {}, requiresAuth = true, authCredentials = null, serverTime = null) => {
    const url = `${API_BASE_URL}${path}`;
    let requestConfig = {
        method,
        url,
        headers: {
            'User-Agent': 'axios/1.9.0',
            'Accept': 'application/json, text/plain, */*',
        },
    };

    let queryStringOrBodyForSign = '';
    let apiMemoForRequestAndSign = '';

    if (requiresAuth) {
        if (!authCredentials || !authCredentials.apiKey || !authCredentials.secretKey) {
            throw new Error('API keys and secret key are required for authenticated requests.');
        }

        const { apiKey, secretKey, apiMemo } = authCredentials;
        
        // El memo que viene de la DB del usuario. Si es null/undefined, lo tratamos como cadena vacía.
        apiMemoForRequestAndSign = apiMemo === undefined || apiMemo === null ? '' : apiMemo;
        
        // --- INICIO DE LA CORRECCIÓN ---
        // Este bloque de código forzaba el memo "GainBot" para V4 POSTs si el memo del usuario estaba vacío.
        // Si la API key en BitMart no tiene memo, o tiene uno diferente, esto causa un desajuste.
        // Lo comentamos para que el memo real del usuario (incluido el vacío) sea el que se use.
        /*
        if (method === 'POST' && path.includes('/v4/') && (apiMemoForRequestAndSign === '' || apiMemoForRequestAndAndSign === null || apiMemoForRequestAndSign === undefined)) {
            apiMemoForRequestAndSign = DEFAULT_V4_POST_MEMO; // Usará 'GainBot' si el memo del usuario está en blanco para V4 POSTs
            console.warn(`[API_MEMO_WORKAROUND] Using default memo '${DEFAULT_V4_POST_MEMO}' for V4 POST request '${path}' as user's memo is blank.`);
        }
        */
        // --- FIN DE LA CORRECCIÓN ---

        const timestamp = serverTime || await getBitmartServerTime();
        requestConfig.headers['X-BM-RECVWINDOW'] = DEFAULT_RECV_WINDOW;
        requestConfig.headers['X-BM-KEY'] = apiKey;
        requestConfig.headers['X-BM-TIMESTAMP'] = timestamp;

        if (method === 'GET') {
            requestConfig.params = { ...data, recvWindow: DEFAULT_RECV_WINDOW };
            // BitMart GET request signature requires query params sorted and URL encoded
            queryStringOrBodyForSign = Object.keys(requestConfig.params)
                .sort()
                .map(key => `${key}=${encodeURIComponent(requestConfig.params[key])}`)
                .join('&');
        } else if (method === 'POST') {
            requestConfig.headers['Content-Type'] = 'application/json';
            requestConfig.data = data;
            queryStringOrBodyForSign = JSON.stringify(data); // POST body is stringified JSON for signature
        }

        // Si apiMemoForRequestAndSign es una cadena vacía, no se enviará el header X-BM-MEMO.
        // Si tiene un valor, se enviará ese valor. ¡Esto es lo que queremos!
        if (apiMemoForRequestAndSign !== undefined && apiMemoForRequestAndSign !== null && apiMemoForRequestAndSign !== '') {
            requestConfig.headers['X-BM-MEMO'] = apiMemoForRequestAndSign;
        } else {
            // Asegurarse de que el header no esté presente si el memo es vacío
            delete requestConfig.headers['X-BM-MEMO']; 
        }

        requestConfig.headers['X-BM-SIGN'] = signMessage(secretKey, timestamp, apiMemoForRequestAndSign, queryStringOrBodyForSign);
    } else { // Public requests (no auth required)
        requestConfig.params = data;
    }

    // Logs detallados antes de enviar la solicitud
    console.log(`\n--- Realizando solicitud ${method} a ${path} ---`);
    console.log(`URL: ${url}`);
    if (method === 'POST' && requestConfig.data) {
        console.log(`Body enviado (para solicitud): ${JSON.stringify(requestConfig.data)}`);
    }
    if (method === 'GET' && requestConfig.params) {
        console.log(`Query Params (para solicitud y firma, ordenados): ${JSON.stringify(requestConfig.params)}`);
    }
    console.log(`Body para Firma (JSON stringificado): ${queryStringOrBodyForSign}`); // Muestra lo que se usó para la firma
    console.log(`Headers enviados: ${JSON.stringify(requestConfig.headers, null, 2)}`);


    try {
        const response = await axios(requestConfig);
        if (response.data.code !== 1000) {
            console.error(`❌ Error de BitMart API: ${response.data.message || 'Unknown error'} (Code: ${response.data.code})`);
            throw new Error(`BitMart API Error: ${response.data.message || 'Unknown error'} (Code: ${response.data.code})`);
        }
        return response.data;
    } catch (error) {
        // Manejo de errores de red o Axio
        if (error.response) {
            // La solicitud fue hecha y el servidor respondió con un estado fuera del rango 2xx
            console.error(`❌ Error en la respuesta de la API de BitMart para ${path}:`, error.response.status, error.response.data);
            throw new Error(`BitMart API Error: ${error.response.data.message || error.message} (Status: ${error.response.status})`);
        } else if (error.request) {
            // La solicitud fue hecha pero no se recibió respuesta
            console.error(`❌ No se recibió respuesta de BitMart para ${path}:`, error.request);
            throw new Error(`No response from BitMart API: ${error.message}`);
        } else {
            // Algo sucedió al configurar la solicitud que provocó un error
            console.error(`❌ Error al configurar la solicitud para ${path}:`, error.message);
            throw new Error(`Error setting up BitMart API request: ${error.message}`);
        }
    }
};

// --- Funciones de Acceso a la API Específicas de BitMart ---

exports.validateApiKeys = async (authCredentials) => {
    // Para validar, intentamos obtener el balance. Si funciona, las claves son válidas.
    console.log('\n--- Validando API Keys de BitMart ---');
    try {
        const balance = await exports.getBalance(authCredentials);
        console.log('✅ API Keys de BitMart validadas con éxito. Balance (primeros 2):', balance.slice(0, 2));
        return true;
    } catch (error) {
        console.error('❌ Falló la validación de API Keys de BitMart:', error.message);
        throw new Error(`Invalid BitMart API Keys: ${error.message}`);
    }
};

exports.getBalance = async (authCredentials) => {
    console.log('\n--- Obteniendo Balance de la Cuenta ---');
    try {
        const response = await makeRequest('GET', '/account/v1/wallet', {}, true, authCredentials);
        console.log('✅ Balance de la cuenta obtenido con éxito.', response.data);
        return response.data.wallet || []; // BitMart API V1 for balance uses 'data.wallet'
    } catch (error) {
        console.error('\n❌ Falló la obtención del balance.');
        throw error;
    }
};

exports.getOpenOrders = async (authCredentials, symbol = '') => {
    console.log(`\n--- Obteniendo Órdenes Abiertas (V4 POST) para ${symbol || 'todos los símbolos'} ---`);
    try {
        const requestBody = {};
        if (symbol) {
            requestBody.symbol = symbol;
        }
        
        // BitMart V4 open orders uses POST method
        const response = await makeRequest('POST', '/spot/v4/query/open-orders', requestBody, true, authCredentials);
        
        const responseData = response.data; // V4 responses typically have the data directly under 'data'

        let orders = [];
        if (Array.isArray(responseData)) {
            // Sometimes the response.data directly is the array (less common for V4)
            orders = responseData;
        } else if (responseData && Array.isArray(responseData.list)) {
            // For V4 /spot/v4/query/open-orders, the orders are usually in response.data.list
            orders = responseData.list;
        } else {
            console.warn('ℹ️ getOpenOrders: La API respondió exitosamente, pero el formato de las órdenes es inesperado.', JSON.stringify(responseData, null, 2));
        }

        if (orders.length > 0) {
            console.log(`✅ ¡Órdenes Abiertas obtenidas! Se encontraron ${orders.length} órdenes.`);
        } else {
            console.log('ℹ️ No se encontraron órdenes abiertas con los criterios especificados (o no tienes órdenes abiertas actualmente).');
            console.log('DEBUG: Respuesta completa si no se encuentran órdenes:', JSON.stringify(responseData)); // Log completo de la respuesta de BitMart si está vacía
        }
        return { orders: orders }; // Devuelve un objeto con la propiedad 'orders'

    } catch (error) {
        console.error('\n❌ Falló la obtención de órdenes abiertas V4.');
        throw error;
    }
};


exports.placeOrder = async (authCredentials, symbol, side, type, size, price = null) => {
    console.log(`\n--- Colocando Orden ${side} de ${type} para ${symbol} ---`);
    try {
        const orderParams = {
            symbol,
            side,
            type,
            size,
            // clientOrderId: `YourCustomID-${Date.now()}` // Opcional, para evitar duplicados si se reenvía
        };
        if (price !== null && (type === 'limit' || type === 'limit_maker')) { // Solo incluir precio para órdenes limit
            orderParams.price = price;
        }
        // BitMart V4 place order uses POST method
        const response = await makeRequest('POST', '/spot/v4/trade/place-order', orderParams, true, authCredentials);
        console.log('✅ Orden colocada con éxito:', response.data);
        return response.data;
    } catch (error) {
        console.error('\n❌ Falló la colocación de la orden.');
        throw error;
    }
};

exports.cancelOrder = async (authCredentials, symbol, orderId) => {
    console.log(`\n--- Cancelando Orden ${orderId} para ${symbol} ---`);
    try {
        const requestBody = {
            symbol,
            orderId
        };
        // BitMart V4 cancel order uses POST method
        const response = await makeRequest('POST', '/spot/v4/trade/cancel-order', requestBody, true, authCredentials);
        console.log('✅ Orden cancelada con éxito:', response.data);
        return response.data;
    } catch (error) {
        console.error('\n❌ Falló la cancelación de la orden.');
        throw error;
    }
};


exports.getHistoryOrdersV4 = async (authCredentials, params = {}) => {
    console.log(`\n--- Obteniendo Historial de Órdenes (V4 POST) para ${params.symbol || 'todos los símbolos'} ---`);
    try {
        const requestBody = { ...params }; // Los parámetros ya vienen como objeto {symbol, orderMode, etc.}
        // BitMart V4 history orders uses POST method
        const response = await makeRequest('POST', '/spot/v4/query/history-orders', requestBody, true, authCredentials);
        
        const responseData = response.data; 
        let orders = [];
        if (responseData && Array.isArray(responseData.list)) {
            orders = responseData.list;
        } else {
            console.warn('ℹ️ getHistoryOrdersV4: La API respondió exitosamente, pero el formato del historial es inesperado.', JSON.stringify(responseData, null, 2));
        }

        if (orders.length > 0) {
            console.log(`✅ Historial de Órdenes obtenido. Se encontraron ${orders.length} órdenes.`);
        } else {
            console.log('ℹ️ No se encontraron órdenes en el historial con los criterios especificados.');
            console.log('DEBUG: Respuesta completa del historial si está vacío:', JSON.stringify(responseData));
        }
        return orders; // Devuelve el array directamente para el historial

    } catch (error) {
        console.error('\n❌ Falló la obtención del historial de órdenes V4.');
        throw error;
    }
};

exports.getKlines = async (symbol, interval, size = 500) => {
    console.log(`\n--- Obteniendo Klines para ${symbol} con intervalo ${interval} ---`);
    try {
        const params = {
            symbol,
            step: interval, // 'step' es el parámetro para el intervalo
            size // Número de klines a obtener (por defecto 500)
        };
        const response = await makeRequest('GET', '/spot/v1/candles', params, false); // No requiere autenticación
        
        if (response.data && Array.isArray(response.data.candles)) {
            console.log(`✅ Klines obtenidos para ${symbol}. Se encontraron ${response.data.candles.length} klines.`);
            return response.data.candles;
        } else {
            console.warn('ℹ️ getKlines: La API respondió exitosamente, pero el formato de los klines es inesperado.', JSON.stringify(response.data, null, 2));
            return [];
        }
    } catch (error) {
        console.error('\n❌ Falló la obtención de klines.');
        throw error;
    }
};