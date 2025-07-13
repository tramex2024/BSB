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
        .sort()
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
    const memoToHash = memo || '';

    console.log(`[SIGN_DEBUG] Timestamp: '${timestamp}'`);
    console.log(`[SIGN_DEBUG] Memo used for hash: '${memoToHash}' (Original memo value: ${memo})`);
    console.log(`[SIGN_DEBUG] Body/Query String for Sign: '${requestBodyOrQueryString}' (Length: ${requestBodyOrQueryString.length})`);

    const messageToHash = `${timestamp}#${memoToHash}#${requestBodyOrQueryString}`;
    console.log(`[SIGN_DEBUG] Message to Hash: '${messageToHash}' (Length: ${messageToHash.length})`);
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
        const serverTime = response.data.data.server_time.toString();
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
 * @param {boolean} [options.isPublic=false] - Indica si la solicitud es a un endpoint público que no requiere headers de autenticación.
 * @returns {Promise<Object>} La respuesta de la API de BitMart.
 */
const makeRequest = async ({ method, path, authCredentials, params = {}, body = {}, isPublic = false }) => {
    const url = `${BASE_URL}${path}`;
    const serverTime = await getBitMartServerTime();

    const { apiKey, secretKey, apiMemo } = authCredentials || {};

    console.log(`[DECRYPT_DEBUG] API Key (para firma, parcial): ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'} (Length: ${apiKey ? apiKey.length : 0})`);
    console.log(`[DECRYPT_DEBUG] API Memo (para firma): '${apiMemo || 'N/A'}' (Length: ${apiMemo ? apiMemo.length : 0})`);

    let requestBodyOrQueryString;
    let headers = {
        'User-Agent': 'axios/1.9.0',
        'Accept': 'application/json, text/plain, */*',
    };

    // --- IMPORTANT CHANGE HERE: Header Initialization based on isPublic ---
    if (!isPublic) {
        // For authenticated requests, always include these
        headers['X-BM-RECVWINDOW'] = 10000;
        headers['Content-Type'] = 'application/json'; // Default for authenticated endpoints
    } else {
        // For public GET requests, be very minimal with headers
        if (method === 'GET' || method === 'DELETE') {
            // Only user-agent and accept should typically be needed for public GETs
            // No 'X-BM-RECVWINDOW' or 'Content-Type' for public GET
        }
        // If it's a public POST (less common but possible), we might need Content-Type
        if (method === 'POST' || method === 'PUT') {
            headers['Content-Type'] = 'application/json';
        }
    }
    // --- END IMPORTANT CHANGE ---


    if (method === 'GET' || method === 'DELETE') {
        requestBodyOrQueryString = createQueryString(params);
    } else if (method === 'POST' || method === 'PUT') {
        requestBodyOrQueryString = JSON.stringify(body);
    } else {
        throw new Error('Unsupported HTTP method.');
    }

    let memoForSignature = apiMemo || '';
    let memoForHeader = apiMemo;

    if (path.startsWith('/spot/v4')) {
        if (!memoForSignature) {
            console.log("[API_MEMO_WORKAROUND] Usando default memo 'GainBot' para V4 POST request porque el memo del usuario está en blanco/nulo.");
            memoForSignature = 'GainBot';
            memoForHeader = 'GainBot';
        }
    } else {
        if (!memoForSignature) {
            console.log("[API_MEMO_WORKAROUND] Usando memo vacío para V1 GET/POST request porque el memo del usuario está en blanco/nulo.");
            memoForHeader = undefined;
        }
    }

    let sign = '';
    if (!isPublic && apiKey && secretKey) { // Only sign if it's not a public request AND credentials exist
        sign = generateSign(serverTime, memoForSignature, requestBodyOrQueryString, secretKey);
        headers['X-BM-KEY'] = apiKey;
        headers['X-BM-TIMESTAMP'] = serverTime;
        headers['X-BM-SIGN'] = sign;

        if (memoForHeader !== undefined && memoForHeader !== null) {
            headers['X-BM-MEMO'] = memoForHeader;
        } else {
            delete headers['X-BM-MEMO'];
        }
    } else if (isPublic) {
        // Double-check: For public requests, ensure no authentication headers are present
        delete headers['X-BM-KEY'];
        delete headers['X-BM-TIMESTAMP'];
        delete headers['X-BM-SIGN'];
        delete headers['X-BM-MEMO'];
    }


    const axiosConfig = {
        method,
        url,
        headers,
        params: (method === 'GET' || method === 'DELETE') ? params : undefined,
        data: (method === 'POST' || method === 'PUT') ? body : undefined,
        timeout: 15000
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
        if (error.response) {
            console.error(`❌ Falló la solicitud a ${path}.`);
            console.error('Error Data:', error.response.data);
            console.error('Error Status:', error.response.status);
            console.error('Error Headers:', error.response.headers);
            throw new Error(`Error de la API de BitMart: ${JSON.stringify(error.response.data)} (Status: ${error.response.status})`);
        } else if (error.request) {
            console.error(`❌ No se recibió respuesta de BitMart para la solicitud a ${path}.`);
            console.error('Error Request:', error.request);
            throw new Error(`No se recibió respuesta de BitMart para ${path}.`);
        } else {
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
            params: { symbol },
            isPublic: true // Mark as public
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
 * Endpoint: GET /spot/v1/candles
 * @param {string} symbol - The trading symbol (e.g., 'BTC_USDT').
 * @param {string} interval - The candlestick interval (e.g., '1m', '5m', '1h', '1d').
 * @param {number} [size=500] - The number of data points to return. Default 500.
 * @returns {Promise<Array<Object>>} An array of kline objects.
 */
const getKlines = async (symbol, interval, size = 500) => {
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
            path: '/spot/quotation/v3/klines',
            params: {
                symbol: symbol,
                step: bitmartStep,
                size: size
            },
            isPublic: true // Crucial: Mark this as a public request
        });

        if (responseData && responseData.code === 1000 && Array.isArray(responseData.data?.candles)) {
            console.log(`✅ Velas para ${symbol} obtenidas. Cantidad: ${responseData.data.candles.length}`);
            return responseData.data.candles.map(candle => ({
                timestamp: parseInt(candle[0]),
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
                params: { recvWindow: 10000 } // RecvWindow is needed for authenticated calls
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
    getKlines,
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