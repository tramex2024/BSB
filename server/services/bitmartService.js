// server/services/bitmartService.js
const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = 'https://api-cloud.bitmart.com'; // BitMart API base URL

/**
 * Ordena y combina los parámetros para la firma.
 * @param {Object} params - Objeto de parámetros.
 * @returns {string} String de parámetros ordenados y combinados.
 */
const sortAndCombineParams = (params) => {
    // If no params, return an empty string to avoid errors
    if (!params || Object.keys(params).length === 0) {
        return '';
    }
    const keys = Object.keys(params).sort();
    return keys.map(key => `${key}${params[key]}`).join('');
};

/**
 * Crea una query string a partir de un objeto de parámetros.
 * @param {Object} params - Objeto de parámetros.
 * @returns {string} La query string formateada (ej. "key1=value1&key2=value1").
 */
const createQueryString = (params) => {
    if (!params || Object.keys(params).length === 0) {
        return '';
    }
    const queryString = Object.keys(params)
        .sort() // Important: sort for consistency in signature if BitMart requires it
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
    return queryString;
};


/**
 * Genera la firma para las solicitudes BitMart.
 * @param {string} timestamp - El timestamp de la solicitud.
 * @param {string} memo - El memo de la API del usuario (puede ser cadena vacía o nulo).
 * @param {string} requestBodyOrQueryString - El cuerpo de la solicitud JSON stringificado (para POST/PUT) o la query string (para GET/DELETE).
 * @param {string} secretKey - La Secret Key del usuario (TEXTO PLANO).
 * @returns {string} La firma SHA256.
 */
const generateSign = (timestamp, memo, requestBodyOrQueryString, secretKey) => {
    // If memo is null, undefined or an empty string, use an empty string for hashing.
    const memoToHash = memo || '';

    console.log(`[SIGN_DEBUG] Timestamp: '${timestamp}'`);
    console.log(`[SIGN_DEBUG] Memo used for hash: '${memoToHash}' (Original memo value: ${memo})`);
    console.log(`[SIGN_DEBUG] Body/Query String for Sign: '${requestBodyOrQueryString}' (Length: ${requestBodyOrQueryString.length})`);

    // Concatenate the parts for hashing
    const messageToHash = `${timestamp}#${memoToHash}#${requestBodyOrQueryString}`;
    console.log(`[SIGN_DEBUG] Message to Hash: '${messageToHash}' (Length: ${messageToHash.length})`);
    // WARNING: Do NOT log the full secret key. Only a partial for debugging if strictly necessary.
    console.log(`[SIGN_DEBUG] API Secret (partial for hash): ${secretKey.substring(0, 5)}...${secretKey.substring(secretKey.length - 5)} (Length: ${secretKey.length})`);

    const signature = crypto.createHmac('sha256', secretKey)
                            .update(messageToHash)
                            .digest('hex');
    return signature;
};

/**
 * Obtiene la hora actual del servidor BitMart.
 * Esto es necesario para la firma de las solicitudes.
 * @returns {Promise<string>} El timestamp del servidor.
 */
const getBitMartServerTime = async () => {
    console.log('\n--- Obteniendo Hora del Servidor BitMart (Público) ---');
    try {
        const response = await axios.get(`${BASE_URL}/system/time`);
        const serverTime = response.data.data.server_time.toString(); // Ensure it's a string
        console.log(`✅ Hora del servidor BitMart obtenida: ${serverTime} (${new Date(parseInt(serverTime)).toISOString()})`);
        return serverTime;
    } catch (error) {
        console.error('❌ Error al obtener la hora del servidor BitMart:', error.message);
        throw new Error('Failed to get BitMart server time.');
    }
};

/**
 * Función centralizada para realizar todas las solicitudes a la API de BitMart.
 * @param {Object} options - Opciones de la solicitud.
 * @param {string} options.method - Método HTTP (GET, POST, PUT, DELETE).
 * @param {string} options.path - Ruta de la API (ej. /account/v1/wallet).
 * @param {Object} [options.authCredentials] - Credenciales de autenticación del usuario (opcional para endpoints públicos).
 * @param {string} options.authCredentials.apiKey - La API Key del usuario (TEXTO PLANO).
 * @param {string} options.authCredentials.secretKey - La Secret Key del usuario (TEXTO PLANO).
 * @param {string} [options.authCredentials.apiMemo] - El Memo de la API del usuario (TEXTO PLANO).
 * @param {Object} [options.params={}] - Parámetros de la query para solicitudes GET/DELETE.
 * @param {Object} [options.body={}] - Cuerpo de la solicitud para solicitudes POST/PUT.
 * @returns {Promise<Object>} La respuesta de la API de BitMart.
 */
const makeRequest = async ({ method, path, authCredentials, params = {}, body = {} }) => {
    const url = `${BASE_URL}${path}`;
    const serverTime = await getBitMartServerTime(); // Always get fresh server time

    // **IMPORTANT:** authCredentials.apiKey, .secretKey, .apiMemo are ASSUMED TO BE IN PLAINTEXT
    // because bitmartAuthMiddleware has already handled decryption.
    const { apiKey, secretKey, apiMemo } = authCredentials || {}; // Handle case where authCredentials might be undefined for public endpoints

    // Debug logs for API Key and Memo before signature generation
    console.log(`[DECRYPT_DEBUG] API Key (para firma, parcial): ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'} (Length: ${apiKey ? apiKey.length : 0})`);
    console.log(`[DECRYPT_DEBUG] API Memo (para firma): '${apiMemo || 'N/A'}' (Length: ${apiMemo ? apiMemo.length : 0})`);

    // Determine the string to be hashed based on the method type
    let requestBodyOrQueryString;
    let headers = {
        'User-Agent': 'axios/1.9.0',
        'Accept': 'application/json, text/plain, */*',
        'X-BM-RECVWINDOW': 10000 // Increased for higher time tolerance
    };

    if (method === 'GET' || method === 'DELETE') {
        requestBodyOrQueryString = createQueryString(params);
        headers['Content-Type'] = 'application/json'; // Good practice to include, even if no body
    } else if (method === 'POST' || method === 'PUT') {
        requestBodyOrQueryString = JSON.stringify(body);
        headers['Content-Type'] = 'application/json'; // Required for JSON body
    } else {
        throw new Error('Unsupported HTTP method.');
    }

    // Logic for MEMO in signature and X-BM-MEMO header
    let memoForSignature = apiMemo || ''; // If apiMemo is null/undefined, use empty string for signature
    let memoForHeader = apiMemo; // X-BM-MEMO header should contain the actual user memo

    // Specific workaround for V4 API if memo is empty, use 'GainBot' in signature and header.
    // For V1, if the user memo is empty/null, don't send X-BM-MEMO or send empty.
    if (path.startsWith('/spot/v4')) {
        if (!memoForSignature) { // If user memo is empty for V4
            console.log("[API_MEMO_WORKAROUND] Usando default memo 'GainBot' para V4 POST request porque el memo del usuario está en blanco/nulo.");
            memoForSignature = 'GainBot'; // Use 'GainBot' for signature
            memoForHeader = 'GainBot'; // And also for X-BM-MEMO header
        }
    } else { // For V1, if memo is empty or null, don't send X-BM-MEMO
        if (!memoForSignature) {
            console.log("[API_MEMO_WORKAROUND] Usando memo vacío para V1 GET/POST request porque el memo del usuario está en blanco/nulo.");
            memoForHeader = undefined; // Do not send the header if memo is empty for V1
        }
    }

    // Only generate signature if API key and secret are provided (i.e., for authenticated requests)
    let sign = '';
    if (apiKey && secretKey) {
        sign = generateSign(serverTime, memoForSignature, requestBodyOrQueryString, secretKey);
        // Configure authentication headers
        headers['X-BM-KEY'] = apiKey; // This must now be the PLAINTEXT API KEY
        headers['X-BM-TIMESTAMP'] = serverTime;
        headers['X-BM-SIGN'] = sign;

        // Configure X-BM-MEMO header
        if (memoForHeader !== undefined && memoForHeader !== null) {
            headers['X-BM-MEMO'] = memoForHeader;
        } else {
            // Ensure the header is not sent if there's no valid memo
            delete headers['X-BM-MEMO'];
        }
    }


    const axiosConfig = {
        method,
        url,
        headers,
        params: (method === 'GET' || method === 'DELETE') ? params : undefined,
        data: (method === 'POST' || method === 'PUT') ? body : undefined,
        // Optional: add a timeout
        timeout: 15000 // 15 seconds
    };

    console.log(`\n--- Realizando solicitud ${method} a ${path} ---`);
    console.log(`URL: ${url}`);
    if (Object.keys(params).length > 0) console.log(`Query Params (para solicitud y firma, ordenados): ${JSON.stringify(params)}`);
    if (Object.keys(body).length > 0) console.log(`Body enviado (para solicitud): ${JSON.stringify(body)}`);
    console.log(`Body para Firma (JSON stringificado): '${requestBodyOrQueryString}'`);
    console.log('Headers enviados:', headers);

    try {
        const response = await axios(axiosConfig);
        console.log(`✅ Solicitud a ${path} exitosa.`);
        return response.data;
    } catch (error) {
        // Log the full error response from BitMart if available
        if (error.response) {
            console.error(`❌ Falló la solicitud a ${path}.`);
            console.error('Error Data:', error.response.data);
            console.error('Error Status:', error.response.status);
            console.error('Error Headers:', error.response.headers);
            throw new Error(`Error de la API de BitMart: ${JSON.stringify(error.response.data)} (Status: ${error.response.status})`);
        } else if (error.request) {
            // The request was made but no response was received
            console.error(`❌ No se recibió respuesta de BitMart para la solicitud a ${path}.`);
            console.error('Error Request:', error.request);
            throw new Error(`No se recibió respuesta de BitMart para ${path}.`);
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error(`❌ Error al configurar la solicitud a ${path}:`, error.message);
            throw new Error(`Error al configurar la solicitud a ${path}: ${error.message}`);
        }
    }
};

/**
 * Fetches the ticker information for a specific symbol.
 * Endpoint: GET /spot/v1/ticker
 * @param {string} symbol - The trading symbol (e.g., 'BTC_USDT').
 * @returns {Object} Ticker data (e.g., { symbol: 'BTC_USDT', last_price: '...', high_24h: '...', low_24h: '...' }).
 */
const getTicker = async (symbol) => {
    console.log(`\n--- Obteniendo Ticker Público para ${symbol} ---`);
    try {
        const responseData = await makeRequest({
            method: 'GET',
            path: '/spot/v1/ticker',
            params: { symbol }
            // No authCredentials needed for public endpoints
        });

        if (responseData && responseData.code === 1000 && responseData.data && Array.isArray(responseData.data.tickers) && responseData.data.tickers.length > 0) {
            const tickerData = responseData.data.tickers[0];
            console.log(`✅ Ticker para ${symbol} obtenido: Último precio = ${tickerData.last_price}, High 24h = ${tickerData.high_24h}, Low 24h = ${tickerData.low_24h}`);
            return {
                symbol: tickerData.symbol,
                last: parseFloat(tickerData.last_price),
                high: parseFloat(tickerData.high_24h),
                low: parseFloat(tickerData.low_24h),
            };
        } else {
            const errorMessage = responseData.message || 'No ticker data or unexpected response structure.';
            console.error(`❌ Error fetching ticker for ${symbol}: ${errorMessage}. Raw response: ${JSON.stringify(responseData)}`);
            throw new Error(`Error fetching ticker for ${symbol}: ${errorMessage}`);
        }

    } catch (error) {
        console.error(`Error en getTicker para ${symbol}:`, error.message);
        throw error;
    }
};

/**
 * Fetches candlestick (kline) data for a specific symbol and interval.
 * Endpoint: GET /spot/v1/klines (TEMPORARY PATH)
 * @param {string} symbol - The trading symbol (e.g., 'BTC_USDT').
 * @param {string} interval - The candlestick interval (e.g., '1m', '5m', '1h', '1d').
 * @param {number} [size=300] - The number of data points to return. Max 300.
 * @returns {Promise<Array<Object>>} An array of kline objects.
 */
const getKlines = async (symbol, interval, size = 300) => {
    console.log(`\n--- Obteniendo Velas (Klines) para ${symbol} en intervalo '${interval}' ---`);
    let bitmartStep;
    switch (interval) {
        case '1m': bitmartStep = '1'; break;
        case '3m': bitmartStep = '3'; break;
        case '5m': bitmartStep = '5'; break;
        case '15m': bitmartStep = '15'; break;
        case '30m': bitmartStep = '30'; break;
        case '1h': bitmartStep = '60'; break;
        case '2h': bitmartStep = '120'; break;
        case '4h': bitmartStep = '240'; break;
        case '12h': bitmartStep = '720'; break;
        case '1d': bitmartStep = '1D'; break;
        case '3d': bitmartStep = '3D'; break;
        case '1w': bitmartStep = '1W'; break;
        default:
            console.warn(`Intervalo '${interval}' no reconocido. Usando '1' (1 minuto) por defecto.`);
            bitmartStep = '1'; // Default to 1 minute
    }

    try {
        const responseData = await makeRequest({
            method: 'GET',
            path: '/spot/v1/klines', // <--- CHANGED PATH TO /spot/v1/klines (Temporary)
            params: {
                symbol: symbol,
                step: bitmartStep,
                size: size
            }
        });

        // The structure for /spot/v1/klines might be slightly different.
        // It typically returns an array directly under `data.klines` or `data.candles`.
        // Let's assume it's `data.klines` and handle both `candles` and `klines`.
        const klinesData = responseData?.data?.klines || responseData?.data?.candles;

        if (responseData && responseData.code === 1000 && Array.isArray(klinesData)) {
            console.log(`✅ Velas para ${symbol} obtenidas. Cantidad: ${klinesData.length}`);
            // Each candle is an array: [timestamp, open, high, low, close, volume]
            return klinesData.map(candle => ({
                timestamp: parseInt(candle[0]), // Timestamp in milliseconds
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            }));
        } else {
            const errorMessage = responseData.message || 'No klines data or unexpected response structure.';
            console.error(`❌ Error fetching klines for ${symbol} (interval ${interval}): ${errorMessage}. Raw response: ${JSON.stringify(responseData)}`);
            throw new Error(`Error fetching klines for ${symbol}: ${errorMessage}`);
        }
    } catch (error) {
        console.error(`Error en getKlines para ${symbol} (interval ${interval}):`, error.message);
        throw error;
    }
};


// Exportar las funciones de servicio de BitMart
module.exports = {
    getBalance: async (authCredentials) => {
        console.log('\n--- Obteniendo Balance de la Cuenta ---');
        try {
            const responseData = await makeRequest({
                method: 'GET',
                path: '/account/v1/wallet',
                authCredentials,
                params: { recvWindow: 10000 }
            });

            if (responseData && responseData.code === 1000 && responseData.data && Array.isArray(responseData.data.wallet)) {
                console.log(`✅ Balance de la cuenta obtenido. Cantidad de activos: ${responseData.data.wallet.length}`);
                return responseData.data.wallet;
            } else {
                const errorMessage = responseData.message || 'No wallet data or unexpected response structure.';
                console.error(`❌ Error fetching balance: ${errorMessage}. Raw response: ${JSON.stringify(responseData)}`);
                throw new Error(`Error fetching balance: ${errorMessage}`);
            }
        } catch (error) {
            console.error('Error in getBalance:', error.message);
            throw error;
        }
    },

    getOpenOrders: async (authCredentials, symbol) => {
        console.log(`\n--- Obteniendo Órdenes Abiertas (V4 POST) para ${symbol} ---`);
        try {
            const responseData = await makeRequest({
                method: 'POST',
                path: '/spot/v4/query/open-orders',
                authCredentials,
                body: { symbol }
            });

            if (responseData && Array.isArray(responseData.data)) {
                console.log(`✅ Órdenes abiertas V4 obtenidas. Cantidad: ${responseData.data.length}`);
                return responseData.data;
            } else {
                console.warn("⚠️ BitMart API did not return an array of orders for open orders or unexpected structure.");
                console.warn("Raw response data:", responseData);
                return [];
            }
        } catch (error) {
            console.error('Error in getOpenOrders:', error.message);
            throw error;
        }
    },

    getHistoryOrdersV4: async (authCredentials, historyParams) => {
        console.log('\n--- Obteniendo Historial de Órdenes (V4 POST) ---');
        try {
            const responseData = await makeRequest({
                method: 'POST',
                path: '/spot/v4/query/history-orders',
                authCredentials,
                body: historyParams
            });

            if (responseData && Array.isArray(responseData.data)) {
                console.log(`✅ Historial de órdenes V4 obtenido. Cantidad: ${responseData.data.length}`);
                return responseData.data;
            } else if (responseData && responseData.data && Array.isArray(responseData.data.orders)) {
                console.log(`✅ Historial de órdenes V4 obtenido (anidado). Cantidad: ${responseData.data.orders.length}`);
                return responseData.data.orders;
            }
            else {
                console.warn("⚠️ BitMart API did not return an array of orders for history or unexpected structure.");
                console.warn("Raw response data:", responseData);
                return [];
            }
        } catch (error) {
            console.error('Error in getHistoryOrdersV4:', error.message);
            throw error;
        }
    },

    getTicker,
    getKlines, // Exporting the corrected getKlines function

    placeOrder: async (authCredentials, symbol, side, type, size, price) => {
        console.log(`\n--- Colocando Orden ${side.toUpperCase()} ${type.toUpperCase()} para ${symbol} ---`);
        const body = { symbol, side, type, size: parseFloat(size) };
        if (type === 'limit' && price) {
            body.price = parseFloat(price);
        } else if (type === 'market' && side === 'buy') {
            body.notional = parseFloat(size);
            delete body.size;
        }

        try {
            const responseData = await makeRequest({
                method: 'POST',
                path: '/spot/v4/submit-order',
                authCredentials,
                body
            });
            console.log(`✅ Orden colocada: ${JSON.stringify(responseData.data)}`);
            return responseData.data;
        } catch (error) {
            console.error('Error al colocar la orden:', error.message);
            throw error;
        }
    },

    cancelOrder: async (authCredentials, symbol, order_id) => {
        console.log(`\n--- Cancelando Orden ${order_id} para ${symbol} ---`);
        try {
            const responseData = await makeRequest({
                method: 'POST',
                path: '/spot/v4/cancel-order',
                authCredentials,
                body: { symbol, order_id }
            });
            console.log(`✅ Orden ${order_id} cancelada: ${JSON.stringify(responseData.data)}`);
            return responseData.data;
        } catch (error) {
            console.error('Error al cancelar la orden:', error.message);
            throw error;
        }
    },

    getOrderDetail: async (authCredentials, symbol, order_id) => {
        console.log(`\n--- Obteniendo Detalle de Orden ${order_id} para ${symbol} ---`);
        try {
            const responseData = await makeRequest({
                method: 'POST',
                path: '/spot/v4/query-order-by-id',
                authCredentials,
                body: { symbol, order_id }
            });

            if (responseData && responseData.code === 1000 && responseData.data) {
                const order = responseData.data;
                console.log(`✅ Detalle de orden ${order_id} obtenido: Estado - ${order.status}`);
                return {
                    order_id: order.order_id,
                    symbol: order.symbol,
                    side: order.side,
                    type: order.type,
                    price: parseFloat(order.price),
                    size: parseFloat(order.size),
                    filled_size: parseFloat(order.filled_size || 0),
                    state: order.status,
                };
            } else {
                throw new Error(`Error fetching order details for ${order_id}: ${responseData.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error al obtener el detalle de la orden:', error.message);
            throw error;
        }
    }
};