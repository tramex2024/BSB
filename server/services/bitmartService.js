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
    const { apiKey, secretKey, apiMemo } = authCredentials;

    // Logs de depuración para la API Key y Memo antes de la generación de la firma
    console.log(`[DECRYPT_DEBUG] API Key (para firma, parcial): ${apiKey.substring(0, 5)}... (Length: ${apiKey.length})`);
    console.log(`[DECRYPT_DEBUG] API Memo (para firma): '${apiMemo}' (Length: ${apiMemo ? apiMemo.length : 0})`);

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

    const sign = generateSign(serverTime, memoForSignature, requestBodyOrQueryString, secretKey);

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

// Exportar las funciones de servicio de BitMart
module.exports = {
    getBalance: async (authCredentials) => {
        console.log('\n--- Obteniendo Balance de la Cuenta ---');
        return makeRequest({
            method: 'GET',
            path: '/account/v1/wallet',
            authCredentials,
            params: { recvWindow: 10000 }
        });
    },

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
            if (responseData && Array.isArray(responseData.data)) { // <-- CHANGE THIS LINE
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
            if (responseData && Array.isArray(responseData.data)) { // <-- Potentially change this if not already done
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
    }
};