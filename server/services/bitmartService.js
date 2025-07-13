// server/services/bitmartService.js
const axios = require('axios');
const crypto = require('crypto');
// No necesitamos importar 'decrypt' aquí, ya que la desencriptación la hace el middleware ahora.

const BASE_URL = 'https://api-cloud.bitmart.com'; // BitMart API base URL

/**
 * Ordena y combina los parámetros para la firma.
 * @param {Object} params - Objeto de parámetros.
 * @returns {string} String de parámetros ordenados y combinados.
 */
const sortAndCombineParams = (params) => {
    // Si no hay params, devuelve una cadena vacía para evitar errores
    if (!params || Object.keys(params).length === 0) {
        return '';
    }
    const keys = Object.keys(params).sort();
    return keys.map(key => `${key}${params[key]}`).join('');
};

/**
 * Crea una query string a partir de un objeto de parámetros.
 * @param {Object} params - Objeto de parámetros.
 * @returns {string} La query string formateada (ej. "key1=value1&key2=value2").
 */
const createQueryString = (params) => {
    if (!params || Object.keys(params).length === 0) {
        return '';
    }
    const queryString = Object.keys(params)
        .sort() // Importante: ordenar para consistencia en la firma si BitMart lo requiere
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
    // Si memo es nulo, undefined o una cadena vacía, se usa una cadena vacía para el hashing.
    const memoToHash = memo || '';

    console.log(`[SIGN_DEBUG] Timestamp: '${timestamp}'`);
    console.log(`[SIGN_DEBUG] Memo used for hash: '${memoToHash}' (Original memo value: ${memo})`);
    console.log(`[SIGN_DEBUG] Body/Query String for Sign: '${requestBodyOrQueryString}' (Length: ${requestBodyOrQueryString.length})`);

    // Concatenate the parts for hashing
    const messageToHash = `${timestamp}#${memoToHash}#${requestBodyOrQueryString}`;
    console.log(`[SIGN_DEBUG] Message to Hash: '${messageToHash}' (Length: ${messageToHash.length})`);
    // OJO: NO loguear la clave secreta completa. Solo una parte para depuración si es estrictamente necesario.
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
        const serverTime = response.data.data.server_time.toString(); // Asegurarse de que sea un string
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
 * @param {Object} options.authCredentials - Credenciales de autenticación del usuario.
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

    // **IMPORTANTE:** authCredentials.apiKey, .secretKey, .apiMemo se ASUME QUE ESTÁN EN TEXTO PLANO
    // porque bitmartAuthMiddleware ya se encargó de la desencriptación.
    const { apiKey, secretKey, apiMemo } = authCredentials || {}; // Handle case where authCredentials might be undefined for public endpoints

    // Logs de depuración para la API Key y Memo antes de la generación de la firma
    console.log(`[DECRYPT_DEBUG] API Key (para firma, parcial): ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'} (Length: ${apiKey ? apiKey.length : 0})`);
    console.log(`[DECRYPT_DEBUG] API Memo (para firma): '${apiMemo || 'N/A'}' (Length: ${apiMemo ? apiMemo.length : 0})`);

    // Determinar la cadena a ser hasheada basada en el tipo de método
    let requestBodyOrQueryString;
    let headers = {
        'User-Agent': 'axios/1.9.0',
        'Accept': 'application/json, text/plain, */*',
        'X-BM-RECVWINDOW': 10000 // Aumentado para mayor tolerancia de tiempo
    };

    if (method === 'GET' || method === 'DELETE') {
        requestBodyOrQueryString = createQueryString(params);
        headers['Content-Type'] = 'application/json'; // Buena práctica incluir, incluso si no hay body
    } else if (method === 'POST' || method === 'PUT') {
        requestBodyOrQueryString = JSON.stringify(body);
        headers['Content-Type'] = 'application/json'; // Requerido para body JSON
    } else {
        throw new Error('Unsupported HTTP method.');
    }

    // Lógica para el MEMO en la firma y en el header X-BM-MEMO
    let memoForSignature = apiMemo || ''; // Si apiMemo es null/undefined, usar cadena vacía para la firma
    let memoForHeader = apiMemo; // El header X-BM-MEMO debería contener el memo real del usuario

    // Workaround específico para la API V4 si el memo está vacío, usa 'GainBot' en la firma y en el header.
    // Para V1, si el memo del usuario es vacío/nulo, no se envía X-BM-MEMO o se envía vacío.
    if (path.startsWith('/spot/v4')) {
        if (!memoForSignature) { // Si el memo del usuario está vacío para V4
            console.log("[API_MEMO_WORKAROUND] Usando default memo 'GainBot' para V4 POST request porque el memo del usuario está en blanco/nulo.");
            memoForSignature = 'GainBot'; // Usa 'GainBot' para la firma
            memoForHeader = 'GainBot'; // Y también para el header X-BM-MEMO
        }
    } else { // Para V1, si el memo está vacío o nulo, no se envía X-BM-MEMO
        if (!memoForSignature) {
            console.log("[API_MEMO_WORKAROUND] Usando memo vacío para V1 GET/POST request porque el memo del usuario está en blanco/nulo.");
            memoForHeader = undefined; // No enviar el header si el memo es vacío para V1
        }
    }

    // Only generate signature if API key and secret are provided (i.e., for authenticated requests)
    let sign = '';
    if (apiKey && secretKey) {
        sign = generateSign(serverTime, memoForSignature, requestBodyOrQueryString, secretKey);
        // Configurar los headers de autenticación
        headers['X-BM-KEY'] = apiKey; // Esto debe ser ahora la API KEY EN TEXTO PLANO
        headers['X-BM-TIMESTAMP'] = serverTime;
        headers['X-BM-SIGN'] = sign;

        // Configurar el header X-BM-MEMO
        if (memoForHeader !== undefined && memoForHeader !== null) {
            headers['X-BM-MEMO'] = memoForHeader;
        } else {
            // Asegurarse de que el header no se envíe si no hay un memo válido
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

// --- AÑADIDA: Función para obtener el Ticker ---
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

        // BitMart's public ticker endpoint returns an array of tickers nested inside a 'data' object.
        // We need to access responseData.data.tickers to get the array.
        if (responseData && responseData.code === 1000 && responseData.data && Array.isArray(responseData.data.tickers) && responseData.data.tickers.length > 0) {
            const tickerData = responseData.data.tickers[0]; // Access the first element of the 'tickers' array
            console.log(`✅ Ticker para ${symbol} obtenido: Último precio = ${tickerData.last_price}, High 24h = ${tickerData.high_24h}, Low 24h = ${tickerData.low_24h}`);
            return {
                symbol: tickerData.symbol,
                last: parseFloat(tickerData.last_price), // Ensure 'last' is a number
                high: parseFloat(tickerData.high_24h),
                low: parseFloat(tickerData.low_24h),
                // Add other relevant fields if needed, like volume, etc.
            };
        } else {
            // If the response is successful (code 1000) but data.tickers is missing or empty
            const errorMessage = responseData.message || 'No ticker data or unexpected response structure.';
            console.error(`❌ Error fetching ticker for ${symbol}: ${errorMessage}. Raw response: ${JSON.stringify(responseData)}`);
            throw new Error(`Error fetching ticker for ${symbol}: ${errorMessage}`);
        }

    } catch (error) {
        // This catch block handles network errors or errors thrown by makeRequest
        console.error(`Error en getTicker para ${symbol}:`, error.message);
        throw error;
    }
};

// Exportar las funciones de servicio de BitMart
module.exports = {
    // --- INICIO DE CORRECCIÓN PARA getBalance ---
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
                return responseData.data.wallet; // <--- Return only the 'wallet' array
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
    // --- FIN DE CORRECCIÓN PARA getBalance ---

    getOpenOrders: async (authCredentials, symbol) => {
        console.log(`\n--- Obteniendo Órdenes Abiertas (V4 POST) para ${symbol} ---`);
        try {
            const responseData = await makeRequest({
                method: 'POST', // V4 usa POST para órdenes abiertas
                path: '/spot/v4/query/open-orders',
                authCredentials,
                body: { symbol }
            });

            // CORRECTION: The array of orders is directly in responseData.data
            if (responseData && Array.isArray(responseData.data)) {
                console.log(`✅ Órdenes abiertas V4 obtenidas. Cantidad: ${responseData.data.length}`);
                return responseData.data; // <-- RETURN responseData.data directly
            } else {
                console.warn("⚠️ BitMart API did not return an array of orders for open orders or unexpected structure.");
                console.warn("Raw response data:", responseData);
                return []; // Return an empty array if the expected data is not found
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
                method: 'POST', // V4 usa POST para historial de órdenes
                path: '/spot/v4/query/history-orders',
                authCredentials,
                body: historyParams // Pasa todos los parámetros relevantes como cuerpo
            });

            // Based on your history orders structure, this part needs to be confirmed too.
            // If it's also directly in `data` like open orders, then the same correction applies.
            // If history returns it in `data.orders`, then the original code was correct for history.
            // Let's assume for now it's similar to open orders based on this new log:
            if (responseData && Array.isArray(responseData.data)) {
                console.log(`✅ Historial de órdenes V4 obtenido. Cantidad: ${responseData.data.length}`);
                return responseData.data; // <-- Return responseData.data directly
            } else if (responseData && responseData.data && Array.isArray(responseData.data.orders)) {
                // Keep this fallback in case history orders are still nested under 'orders'
                console.log(`✅ Historial de órdenes V4 obtenido (anidado). Cantidad: ${responseData.data.orders.length}`);
                return responseData.data.orders;
            }
            else {
                console.warn("⚠️ BitMart API did not return an array of orders for history or unexpected structure.");
                console.warn("Raw response data:", responseData);
                return []; // Return an empty array if the expected data is not found
            }
        } catch (error) {
            console.error('Error in getHistoryOrdersV4:', error.message);
            throw error;
        }
    },

    // AÑADIDA: Exportar la función getTicker
    getTicker,

    // Agrega aquí otras funciones de BitMart que puedas necesitar
    // Por ejemplo, para colocar órdenes:
    placeOrder: async (authCredentials, symbol, side, type, size, price) => {
        console.log(`\n--- Colocando Orden ${side.toUpperCase()} ${type.toUpperCase()} para ${symbol} ---`);
        const body = { symbol, side, type, size: parseFloat(size) };
        if (type === 'limit' && price) {
            body.price = parseFloat(price);
        } else if (type === 'market' && side === 'buy') {
            body.notional = parseFloat(size); // For market buy, 'size' is USDT amount
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
            return responseData.data; // Retorna el ID de la orden y otros detalles
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
                method: 'POST', // V4 uses POST for query-order-by-id
                path: '/spot/v4/query-order-by-id',
                authCredentials,
                body: { symbol, order_id }
            });

            if (responseData && responseData.code === 1000 && responseData.data) {
                const order = responseData.data; // Assuming 'data' directly contains the order object
                console.log(`✅ Detalle de orden ${order_id} obtenido: Estado - ${order.status}`);
                return {
                    order_id: order.order_id,
                    symbol: order.symbol,
                    side: order.side,
                    type: order.type,
                    price: parseFloat(order.price),
                    size: parseFloat(order.size),
                    filled_size: parseFloat(order.filled_size || 0),
                    state: order.status, // BitMart uses 'status'
                    // Add other fields you might need
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