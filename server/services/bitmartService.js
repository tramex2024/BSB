// server/services/bitmartService.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const querystring = require('querystring');

const BASE_URL = 'https://api-cloud.bitmart.com';

/**
 * Sorts object keys recursively to ensure consistent serialization for signature generation.
 * @param {object} obj - The object to sort.
 * @returns {object} The object with sorted keys.
 */
function sortObjectKeys(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    if (Array.isArray(obj)) {
        // Recursively sort objects within arrays
        return obj.map(item => sortObjectKeys(item));
    }

    const sortedKeys = Object.keys(obj).sort();
    const sortedObj = {};
    for (const key of sortedKeys) {
        sortedObj[key] = sortObjectKeys(obj[key]);
    }
    return sortedObj;
}

/**
 * Generates the BitMart API signature.
 * @param {string} timestamp - Current timestamp in milliseconds.
 * @param {string} memo - The API memo.
 * @param {string} requestMethod - HTTP method (GET, POST).
 * @param {string} requestPath - The API endpoint path.
 * @param {string} bodyOrQueryString - Stringified request body (for POST) or query string (for GET).
 * @param {string} apiSecret - The API secret key.
 * @returns {string} The generated HMAC SHA256 signature in hexadecimal format.
 */
function generateSign(timestamp, memo, requestMethod, requestPath, bodyOrQueryString, apiSecret) {
    // Ensure memo is a string. If null/undefined, treat as empty string for hashing.
    const memoForHash = (memo === null || memo === undefined || typeof memo !== 'string') ? '' : memo;

    // Ensure bodyOrQueryString is an empty string if it's undefined, null, or empty,
    // aligning with BitMart's signature expectation for empty bodies/queries.
    const finalBodyOrQueryString = (bodyOrQueryString === undefined || bodyOrQueryString === null || bodyOrQueryString === '') ? '' : bodyOrQueryString;

    // Normalize path to remove trailing slash if present, for consistency with signature rules.
    const normalizedPath = requestPath.endsWith('/') && requestPath.length > 1 ? requestPath.slice(0, -1) : requestPath;

    const message = timestamp + '#' + memoForHash + '#' + requestMethod.toUpperCase() + '#' + normalizedPath + '#' + finalBodyOrQueryString;

    console.log(`[SIGN_DEBUG] Timestamp: '${timestamp}'`);
    console.log(`[SIGN_DEBUG] Memo used for hash: '${memoForHash}' (Original memo value: ${memo}, Type: ${typeof memo})`);
    console.log(`[SIGN_DEBUG] Method for Sign: '${requestMethod.toUpperCase()}'`);
    console.log(`[SIGN_DEBUG] Path for Sign: '${normalizedPath}'`);
    console.log(`[SIGN_DEBUG] Body/Query String for Sign: '${finalBodyOrQueryString}' (Length: ${finalBodyOrQueryString.length})`);
    console.log(`[SIGN_DEBUG] Message to Hash: '${message}' (Length: ${message.length})`);
    console.log(`[SIGN_DEBUG] API Secret (partial for hash): ${apiSecret.substring(0,5)}...${apiSecret.substring(apiSecret.length - 5)} (Length: ${apiSecret.length})`);

    // Explicitly encode the message and secret to UTF-8 before hashing to prevent encoding issues.
    const hmac = CryptoJS.HmacSHA256(CryptoJS.enc.Utf8.parse(message), CryptoJS.enc.Utf8.parse(apiSecret));
    return hmac.toString(CryptoJS.enc.Hex);
}

/**
 * Makes an authenticated or public request to the BitMart API.
 * @param {string} method - HTTP method (GET, POST).
 * @param {string} path - The API endpoint path.
 * @param {object} paramsOrData - Request parameters (for GET) or body data (for POST).
 * @param {boolean} isPrivate - Whether the request requires authentication.
 * @param {object} authCredentials - Object containing apiKey, secretKey, and apiMemo.
 * @param {string} timestampOverride - Optional: Use a specific timestamp for testing/sync.
 * @returns {Promise<object>} The API response data.
 * @throws {Error} If the API request fails or returns an unexpected response.
 */
async function makeRequest(method, path, paramsOrData = {}, isPrivate = true, authCredentials = {}, timestampOverride) {
    const timestamp = timestampOverride || Date.now().toString();
    const url = `${BASE_URL}${path}`;
    let bodyForSign = ''; // The string used in the signature calculation
    let requestConfig = {
        headers: {
            'User-Agent': 'axios/1.9.0',
            'Accept': 'application/json, text/plain, */*'
        },
        timeout: 15000
    };

    const { apiKey, secretKey, apiMemo } = authCredentials;
    // Ensure apiMemoForRequestAndSign is a string, even if it's an empty one.
    const apiMemoForRequestAndSign = (apiMemo === null || apiMemo === undefined || typeof apiMemo !== 'string') ? '' : apiMemo;

    const dataForRequest = { ...paramsOrData }; // Shallow copy to avoid modifying original

    // Detección de V4 para el encabezado X-BM-SIGN-TYPE y X-BM-MEMO
    // BitMart usa '2' para la mayoría de los V4, y a veces '1' para V1/V2
    const isV4Endpoint = path.includes('/v4/'); 
    requestConfig.headers['X-BM-SIGN-TYPE'] = '2'; // Usar 2 por defecto para la mayoría de las APIs recientes.

    if (isPrivate) {
        // X-BM-RECVWINDOW is typically used for private endpoints
        requestConfig.headers['X-BM-RECVWINDOW'] = 10000;
    }

    if (method === 'GET') {
        // For GET, params go into the query string and are part of the signature
        if (isPrivate) {
            dataForRequest.recvWindow = 10000;
        }
        requestConfig.params = sortObjectKeys(dataForRequest);
        bodyForSign = querystring.stringify(requestConfig.params);
    } else if (method === 'POST') {
        // For POST, data goes into the request body
        requestConfig.data = dataForRequest;

        // Special handling for bodyForSign for POST requests
        const sortedData = sortObjectKeys(dataForRequest);
        if (Object.keys(sortedData).length === 0) {
            // If the request body is an empty object, the string for signature should be '{}'
            // as it matches the actual request body for an empty JSON payload.
            bodyForSign = '{}';
        } else {
            // Stringify with no extra spaces to ensure consistent representation for signature.
            bodyForSign = JSON.stringify(sortedData);
        }

        requestConfig.headers['Content-Type'] = 'application/json';
    }

    if (isPrivate) {
        // More robust check for credentials, including ensuring apiMemo is a string.
        if (!apiKey || !secretKey || typeof apiMemoForRequestAndSign !== 'string') {
            console.error(`ERROR: Credenciales de BitMart API incompletas o inválidas para la autenticación.
              API Key presente: ${!!apiKey}, Secret Key presente: ${!!secretKey},
              API Memo es string: ${typeof apiMemoForRequestAndSign === 'string'}.
              Asegúrate de que el usuario haya configurado todas sus claves correctamente.`);
            throw new Error("Credenciales de BitMart API incompletas (API Key, Secret, o Memo). Asegúrate de que el user haya configurado todas sus claves correctamente.");
        }

        // Logs to verify API credentials and memo just before signature generation
        console.log(`[API_CRED_DEBUG] API Key (used for request): '${apiKey ? apiKey.substring(0, 5) + '...' + apiKey.substring(apiKey.length - 5) : 'N/A'}' (Length: ${apiKey ? apiKey.length : 0})`);
        console.log(`[API_CRED_DEBUG] Secret Key (used for signing): '${secretKey ? secretKey.substring(0, 5) + '...' + secretKey.substring(secretKey.length - 5) : 'N/A'}' (Length: ${secretKey ? secretKey.length : 0})`);
        console.log(`[API_CRED_DEBUG] API Memo (used for request & signing): '${apiMemoForRequestAndSign}' (Type: ${typeof apiMemoForRequestAndSign}, Length: ${apiMemoForRequestAndSign ? apiMemoForRequestAndSign.length : 0})`);
        // Added more detailed raw character log for memo
        console.log(`[API_CRED_DEBUG] API Memo (raw characters): [${apiMemoForRequestAndSign.split('').map(c => `U+${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join(', ')}]`);
        console.log(`[API_CRED_DEBUG] Is V4 Endpoint: ${isV4Endpoint}`);

        // Generate the signature
        const sign = generateSign(timestamp, apiMemoForRequestAndSign, method, path, bodyForSign, secretKey);

        // Set required headers for authenticated requests
        requestConfig.headers['X-BM-KEY'] = apiKey;
        requestConfig.headers['X-BM-TIMESTAMP'] = timestamp;
        requestConfig.headers['X-BM-SIGN'] = sign;

        // *** NUEVOS CONSOLE.LOG PARA DEPURACIÓN ***
        console.log(`[DEBUG_HEADER] Path: ${path}, isV4Endpoint: ${isV4Endpoint}, apiMemoForRequestAndSign: '${apiMemoForRequestAndSign}'`);

        // El encabezado X-BM-MEMO solo se envía para endpoints V4 Y si el memo está definido.
        // Para V1/V2, el encabezado X-BM-MEMO NO debe enviarse, incluso si la API Key tiene un memo.
        if (isV4Endpoint && apiMemoForRequestAndSign !== '') {
            requestConfig.headers['X-BM-MEMO'] = apiMemoForRequestAndSign;
            console.log('[DEBUG_HEADER] X-BM-MEMO ADDED (V4 and memo present).');
        } else {
            // Ensure X-BM-MEMO is not sent for V1/V2 endpoints
            delete requestConfig.headers['X-BM-MEMO'];
            console.log('[DEBUG_HEADER] X-BM-MEMO DELETED or not added (V1/V2 or no memo).');
        }
    }

    // Comprehensive logs before sending the request
    console.log(`\n--- Realizando solicitud ${method} a ${path} ---`);
    console.log(`URL: ${url}`);
    if (method === 'POST') {
        console.log('Body enviado (para solicitud):', JSON.stringify(requestConfig.data));
        console.log('Body para Firma (JSON stringificado, ordenado):', bodyForSign);
    } else {
        console.log('Query Params (para solicitud y firma, ordenados):', JSON.stringify(requestConfig.params));
    }
    console.log('Headers enviados:', JSON.stringify(requestConfig.headers, null, 2));

    try {
        const response = await axios({
            method: method,
            url: url,
            ...requestConfig
        });

        // Check BitMart's specific success code (1000)
        if (response.data && response.data.code === 1000) {
            // Debugging log for successful balance retrieval structure
            if (path === '/account/v1/wallet') {
                console.log('DEBUG: BitMart wallet raw response.data:', JSON.stringify(response.data, null, 2));
            }
            return response.data;
        } else {
            console.error(`❌ Error en la respuesta de la API de BitMart para ${path}:`, JSON.stringify(response.data, null, 2));
            throw new Error(`Error de BitMart API: ${response.data.message || response.data.error_msg || 'Respuesta inesperada'} (Code: ${response.data.code || 'N/A'})`);
        }
    } catch (error) {
        console.error(`\n❌ Falló la solicitud a ${path}.`);
        if (error.response) {
            // Axios error with a response from the server
            console.error('Error Data:', JSON.stringify(error.response.data, null, 2));
            console.error('Error Status:', error.response.status);
            console.error('Error Headers:', error.response.headers);
            throw new Error(`Error de la API de BitMart: ${JSON.stringify(error.response.data)} (Status: ${error.response.status})`);
        } else if (error.request) {
            // Axios error without a response (e.g., network issue, timeout)
            console.error('Error Request: No se recibió respuesta. ¿Problema de red o firewall?');
            throw new Error('No se recibió respuesta de BitMart API. Posible problema de red, firewall o la API no está disponible.');
        } else {
            // Other errors (e.g., in request setup)
            console.error('Error Message:', error.message);
            throw new Error(`Error desconocido al procesar la solicitud: ${error.message}`);
        }
    }
}

// --- Public Endpoints ---

/**
 * Gets the current server time from BitMart.
 * @returns {Promise<string>} The server time in milliseconds as a string.
 */
async function getSystemTime() {
    console.log('\n--- Obteniendo Hora del Servidor BitMart (Público) ---');
    try {
        const response = await makeRequest('GET', '/system/time', {}, false); // isPrivate = false
        if (response && response.code === 1000 && response.data && response.data.server_time) {
            const serverTime = response.data.server_time.toString();
            console.log(`✅ Hora del servidor BitMart obtenida: ${serverTime} (${new Date(parseInt(serverTime)).toISOString()})`);
            return serverTime;
        } else {
            const errorMessage = response.message || response.error_msg || 'Respuesta inesperada';
            console.error(`❌ Respuesta inesperada al obtener la hora del servidor:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada de BitMart al obtener hora del servidor: ${errorMessage}`);
        }
    } catch (error) {
        console.error(`❌ Error al obtener la hora del servidor de BitMart:`, error.message);
        throw error;
    }
}

/**
 * Gets ticker information for a specific symbol.
 * @param {string} symbol - The trading pair symbol (e.g., "BTC_USDT").
 * @returns {Promise<object>} Ticker data.
 */
async function getTicker(symbol) {
    try {
        const url = `/spot/quotation/v3/ticker`;
        const params = { symbol: symbol };
        console.log(`--- Solicitud GET Ticker para ${symbol} ---`);
        const response = await makeRequest('GET', url, params, false); // Public endpoint
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Ticker para ${symbol} obtenido con éxito.`);
            return response.data;
        } else {
            console.error(`❌ Respuesta inesperada del ticker para ${symbol}:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada del ticker de BitMart: ${JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error(`❌ Falló la solicitud a getTicker para ${symbol}.`);
        throw error;
    }
}

/**
 * Gets candlestick (Kline) data for a specific symbol and interval.
 * @param {string} symbol - The trading pair symbol (e.g., "BTC_USDT").
 * @param {number} interval - The interval in minutes (e.g., 1, 5, 15, 30, 60, 240, 480, 720, 1440).
 * @param {number} [limit=200] - The maximum number of klines to retrieve.
 * @returns {Promise<Array<object>>} Array of candlestick objects.
 */
async function getKlines(symbol, interval, limit = 200) {
    console.log(`\n--- Solicitud GET Klines (Candlesticks) para ${symbol}, intervalo ${interval}, ${limit} velas ---`);
    const path = `/spot/quotation/v3/klines`;
    const params = { symbol: symbol, step: interval, limit: limit };
    try {
        const response = await makeRequest('GET', path, params, false); // Public endpoint
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Klines (Candlesticks) para ${symbol} obtenidos con éxito.`);
            const candles = response.data.map(c => ({
                timestamp: parseInt(c[0]),
                open: parseFloat(c[1]),
                high: parseFloat(c[2]),
                low: parseFloat(c[3]),
                close: parseFloat(c[4]),
                volume: parseFloat(c[5])
            }));
            return candles;
        } else {
            console.error(`❌ Respuesta inesperada de klines (candlesticks) para ${symbol}:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada de Klines (Candlesticks) de BitMart: ${JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error(`❌ Falló la solicitud a getKlines para ${symbol}.`);
        throw error;
    }
}


// --- Private Endpoints ---

/**
 * Gets the user's wallet balance.
 * @param {object} authCredentials - API Key, Secret Key, and Memo.
 * @returns {Promise<object[]>} Wallet balance data (array of asset objects).
 */
async function getBalance(authCredentials) {
    console.log('\n--- Obteniendo Balance de la Cuenta ---');
    try {
        const serverTime = await getSystemTime(); // Always fetch fresh server time
        // This is a V1 endpoint.
        const response = await makeRequest('GET', '/account/v1/wallet', {}, true, authCredentials, serverTime);
        if (response && response.code === 1000 && response.data && response.data.wallet) {
            console.log('✅ Balance de la cuenta obtenido con éxito.');
            // Return only the wallet array for easier consumption
            return response.data.wallet;
        } else {
            console.error('❌ Falló la obtención del balance de la cuenta. Respuesta inesperada:', JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada al obtener balance de BitMart: ${response.data.message || response.data.error_msg || JSON.stringify(response)}`);
        }
    }
    catch (error) {
        console.error('\n❌ Error al obtener balance de la cuenta:', error.message);
        throw error;
    }
}

/**
 * Retrieves a list of current open orders for a user.
 * @param {object} authCredentials - API Key, Secret Key, and Memo.
 * @param {string} [symbol] - Optional: Filter by trading pair symbol (e.g., "BTC_USDT").
 * @returns {Promise<object[]>} An array of open order objects.
 */
async function getOpenOrders(authCredentials, symbol) {
    console.log(`\n--- Obteniendo Órdenes Abiertas (V4 POST) para ${symbol || 'todos los símbolos'} ---`);
    const path = '/spot/v4/query/open-orders';
    const requestBody = {};
    if (symbol) { requestBody.symbol = symbol; } // Add symbol if provided
    try {
        const serverTime = await getSystemTime();
        // This is a V4 endpoint.
        const response = await makeRequest('POST', path, requestBody, true, authCredentials, serverTime);
        const responseData = response.data;
        let orders = [];
        if (Array.isArray(responseData)) { // Some V4 endpoints directly return an array
            orders = responseData;
        } else if (responseData && Array.isArray(responseData.list)) { // Common V4 structure
            orders = responseData.list;
        } else {
            console.warn('ℹ️ getOpenOrders: La API respondió exitosamente, pero el formato de las órdenes es inesperado.', JSON.stringify(responseData, null, 2));
        }
        if (orders.length > 0) {
            console.log(`✅ ¡Órdenes Abiertas obtenidas! Se encontraron ${orders.length} órdenes.`);
        } else {
            console.log('ℹ️ No se encontraron órdenes abiertas con los criterios especificados (o no tienes órdenes abiertas actualmente).');
            console.log("DEBUG: Respuesta completa si no se encuentran órdenes:", JSON.stringify(responseData, null, 2));
        }
        // Return just the array of orders for simplicity
        return orders;
    } catch (error) {
        console.error('\n❌ Falló la obtención de órdenes abiertas V4.');
        throw error;
    }
}

/**
 * Retrieves the detail of a specific order by order ID. (V4 Endpoint)
 * @param {object} authCredentials - API Key, Secret Key, and Memo.
 * @param {string} symbol - The trading pair symbol.
 * @param {string} orderId - The ID of the order to retrieve.
 * @returns {Promise<object>} Order detail data.
 */
async function getOrderDetail(authCredentials, symbol, orderId) {
    console.log(`\n--- Obteniendo Detalle de Orden ${orderId} para ${symbol} (V4 POST) ---`);
    const requestBody = { symbol: symbol, orderId: orderId };
    try {
        const serverTime = await getSystemTime();
        const response = await makeRequest('POST', '/spot/v4/query/order-detail', requestBody, true, authCredentials, serverTime);
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Detalle de orden ${orderId} obtenido con éxito.`);
            return response.data;
        } else {
            console.error(`❌ Falló la obtención del detalle de la orden. Respuesta inesperada:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada al obtener detalle de orden de BitMart: ${JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error('\n❌ Error al obtener el detalle de la orden:', error.message);
        throw error;
    }
}

/**
 * Places a new order (limit or market).
 * @param {object} authCredentials - API Key, Secret Key, and Memo.
 * @param {string} symbol - The trading pair symbol (e.g., "BTC_USDT").
 * @param {'buy'|'sell'} side - Order side.
 * @param {'limit'|'market'} type - Order type.
 * @param {string|number} amount - The quantity. For 'limit' and 'market sell', this is `size` (base currency amount).
 * For 'market buy', this is `notional` (quote currency amount).
 * @param {string|number} [price] - The price for limit orders. Required for 'limit' type.
 * @returns {Promise<object>} Order placement confirmation.
 */
async function placeOrder(authCredentials, symbol, side, type, amount, price) {
    console.log(`[DEBUG_BITMART_SERVICE] placeOrder - symbol: ${symbol}, side: ${side}, type: ${type}, amount: ${amount}, price: ${price}`);
    console.log(`\n--- Colocando Orden ${side.toUpperCase()} de ${amount} ${symbol} (${type}) ---`);
    const requestBody = { 
        symbol: symbol, 
        side: side, 
        type: type,
        open_type: 'cash', // Important for cash account orders
        client_oid: `oid_${Date.now()}` // Unique client order ID
    };

    if (type === 'limit') {
        if (!price) { throw new Error("El precio es requerido para órdenes de tipo 'limit'."); }
        requestBody.size = String(amount); // Ensure string type for API
        requestBody.price = String(price); // Ensure string type for API
    } else if (type === 'market') {
        if (side === 'buy') {
            requestBody.notional = String(amount); // For market buy, 'amount' is 'notional' (quote currency)
        } else if (side === 'sell') {
            requestBody.size = String(amount); // For market sell, 'amount' is 'size' (base currency)
        } else {
            throw new Error(`Tipo de orden no soportado para side: ${side} y type: ${type}`);
        }
    } else {
        throw new Error(`Tipo de orden no soportado: ${type}`);
    }

    console.log('DEBUG: requestBody antes de makeRequest:', requestBody);
    try {
        const serverTime = await getSystemTime();
        // This is a V2 endpoint.
        const response = await makeRequest('POST', '/spot/v2/submit_order', requestBody, true, authCredentials, serverTime);
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Orden colocada con éxito:`, response.data);
            return response.data;
        } else {
            console.error(`❌ Falló la colocación de la orden. Respuesta inesperada:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada al colocar orden de BitMart: ${response.data.message || response.data.error_msg || JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error('\n❌ Error al colocar la orden:', error.message);
        throw error;
    }
}

/**
 * Cancels a specific open order.
 * @param {object} authCredentials - API Key, Secret Key, and Memo.
 * @param {string} symbol - The trading pair symbol.
 * @param {string} order_id - The ID of the order to cancel.
 * @returns {Promise<object>} Order cancellation confirmation.
 */
async function cancelOrder(authCredentials, symbol, order_id) {
    console.log(`\n--- Cancelando Orden ${order_id} para ${symbol} ---`);
    const requestBody = { symbol: symbol, order_id: order_id };
    try {
        const serverTime = await getSystemTime();
        // This is a V2 endpoint.
        const response = await makeRequest('POST', '/spot/v2/cancel-order', requestBody, true, authCredentials, serverTime);
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Orden ${order_id} cancelada con éxito.`);
            return response.data;
        } else {
            console.error(`❌ Falló la cancelación de la orden. Respuesta inesperada:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada al cancelar orden de BitMart: ${JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error('\n❌ Error al cancelar la orden:', error.message);
        throw error;
    }
}

/**
 * Retrieves a user's historical orders.
 * @param {object} authCredentials - API Key, Secret Key, and Memo.
 * @param {object} options - Optional filters: symbol, orderMode, startTime, endTime, limit.
 * @returns {Promise<object[]>} An array of historical orders.
 */
async function getHistoryOrdersV4(authCredentials, options = {}) {
    console.log(`\n--- Listando Historial de Órdenes (V4 POST) ---`);
    const path = '/spot/v4/query/history-orders';
    const requestBody = {};
    if (options.symbol) { requestBody.symbol = options.symbol; }
    if (options.orderMode) { requestBody.orderMode = options.orderMode; }
    if (options.startTime) { requestBody.startTime = options.startTime; }
    if (options.endTime) { requestBody.endTime = options.endTime; }
    if (options.limit) { requestBody.limit = options.limit; }
    try {
        const serverTime = await getSystemTime();
        // This is a V4 endpoint.
        const response = await makeRequest('POST', path, requestBody, true, authCredentials, serverTime);
        const responseData = response.data;
        let orders = [];
        if (Array.isArray(responseData)) { // Some V4 endpoints directly return an array
            orders = responseData;
        } else if (responseData && Array.isArray(responseData.list)) { // Common V4 structure
            orders = responseData.list;
        } else {
            console.warn('ℹ️ getHistoryOrdersV4: La API respondió exitosamente, pero el formato de las órdenes es inesperado.', JSON.stringify(responseData, null, 2));
        }
        if (orders.length > 0) {
            console.log(`✅ ¡Historial de Órdenes obtenido! Se encontraron ${orders.length} órdenes.`);
        } else {
            console.log('ℹ️ No se encontraron órdenes en el historial con los criterios especificados.');
            console.log("DEBUG: Respuesta completa si no se encuentran órdenes:", JSON.stringify(responseData, null, 2));
        }
        // Return just the array of orders for simplicity
        return orders;
    } catch (error) {
        console.error('\n❌ Falló la obtención del historial de órdenes V4.');
        throw error;
    }
}

/**
 * Validates the provided API credentials by attempting to get the account balance.
 * @param {string} apiKey - The BitMart API Key.
 * @param {string} secretKey - The BitMart API Secret Key.
 * @param {string} apiMemo - The BitMart API Memo.
 * @returns {Promise<boolean>} True if credentials are valid, false otherwise.
 */
async function validateApiKeys(apiKey, secretKey, apiMemo) {
    console.log('\n--- Iniciando validación de credenciales API de BitMart ---');
    // Ensure apiMemo is a string for validation
    const memoForValidation = (apiMemo === null || apiMemo === undefined || typeof apiMemo !== 'string') ? '' : apiMemo;

    if (!apiKey || !secretKey || typeof memoForValidation !== 'string') {
        console.error("ERROR: API Key, Secret Key o API Memo no proporcionados o no son válidos (ej. Memo no es un string) para validación.");
        return false;
    }

    try {
        // Use getBalance (V1 endpoint) for validation
        await getBalance({ apiKey, secretKey, apiMemo: memoForValidation });
        console.log('✅ Credenciales API de BitMart validadas con éxito. CONECTADO.');
        return true;
    } catch (error) {
        console.error('❌ Falló la validación de credenciales API de BitMart:', error.message);
        if (error.message.includes('Status: 401') || error.message.includes('Status: 403')) {
            console.error('Sugerencia: Las claves API o el memo podrían ser incorrectos, o no tener los permisos necesarios.');
        }
        return false;
    }
}

module.exports = {
    getTicker,
    getBalance,
    getOpenOrders,
    getOrderDetail,
    placeOrder,
    cancelOrder,
    getHistoryOrdersV4,
    getKlines,
    validateApiKeys,
    getSystemTime,
};