// server/services/bitmartService.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const querystring = require('querystring');

const BASE_URL = 'https://api-cloud.bitmart.com';

/**
 * Función auxiliar para ordenar recursivamente las claves de un objeto.
 * Es crucial para la firma de BitMart en solicitudes POST,
 * ya que JSON.stringify no garantiza el orden y BitMart lo requiere.
 * También asegura que los elementos de arrays que son objetos se ordenen.
 */
function sortObjectKeys(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return obj; // Devolver tipos primitivos o nulos sin modificar
    }

    if (Array.isArray(obj)) {
        // Si es un array, ordenar recursivamente cada elemento si es un objeto
        return obj.map(item => sortObjectKeys(item));
    }

    const sortedKeys = Object.keys(obj).sort();
    const sortedObj = {};
    for (const key of sortedKeys) {
        sortedObj[key] = sortObjectKeys(obj[key]); // Ordenar recursivamente objetos anidados
    }
    return sortedObj;
}

/**
 * Genera la firma para la solicitud a la API de BitMart.
 * @param {string} timestamp - Timestamp actual en milisegundos.
 * @param {string} memo - El memo de la API (X-BM-MEMO). Puede ser una cadena vacía.
 * @param {string} bodyOrQueryString - El cuerpo stringificado JSON (para POST) o la query string (para GET).
 * @param {string} apiSecret - La clave secreta de la API a usar para la firma.
 * @returns {string} - Firma HMAC SHA256.
 */
function generateSign(timestamp, memo, bodyOrQueryString, apiSecret) {
    const effectiveMemo = memo || ''; // Asegurarse de que memo sea una cadena, incluso si es null o undefined
    const message = timestamp + '#' + effectiveMemo + '#' + bodyOrQueryString;

    // Logs de depuración de la firma
    console.log(`[SIGN_DEBUG] Timestamp: '${timestamp}'`);
    console.log(`[SIGN_DEBUG] Memo: '${effectiveMemo}' (Length: ${effectiveMemo.length})`);
    console.log(`[SIGN_DEBUG] Body/Query String for Sign: '${bodyOrQueryString}' (Length: ${bodyOrQueryString.length})`);
    console.log(`[SIGN_DEBUG] Message to Hash: '${message}' (Length: ${message.length})`);
    console.log(`[SIGN_DEBUG] API Secret (partial for hash): ${apiSecret.substring(0,5)}...${apiSecret.substring(apiSecret.length - 5)} (Length: ${apiSecret.length})`);

    return CryptoJS.HmacSHA256(message, apiSecret).toString(CryptoJS.enc.Hex);
}

/**
 * Función genérica para realizar solicitudes a la API de BitMart.
 * @param {string} method - Método HTTP ('GET' o 'POST').
 * @param {string} path - Ruta del endpoint.
 * @param {object} [paramsOrData={}] - Parámetros para GET o cuerpo para POST.
 * @param {boolean} [isPrivate=true] - Si la solicitud requiere autenticación.
 * @param {object} [authCredentials={}] - REQUERIDO para solicitudes privadas: Objeto con { apiKey, secretKey, apiMemo }.
 * @param {string} [timestampOverride] - Opcional: timestamp a usar en lugar de Date.now().toString().
 * @returns {Promise<object>} - Promesa que resuelve con los datos de la respuesta.
 */
async function makeRequest(method, path, paramsOrData = {}, isPrivate = true, authCredentials = {}, timestampOverride) {
    const timestamp = timestampOverride || Date.now().toString(); // Usar timestamp proporcionado o Date.now()
    const url = `${BASE_URL}${path}`;
    let bodyForSign = '';
    let requestConfig = {
        headers: {
            'User-Agent': 'axios/1.9.0',
            'Accept': 'application/json, text/plain, */*'
        },
        timeout: 15000
    };

    const { apiKey, secretKey, apiMemo } = authCredentials;

    const effectiveParamsOrData = { ...paramsOrData };
    if (isPrivate) {
        effectiveParamsOrData.recvWindow = 10000; // BitMart recomienda 5000, 10000 para recvWindow
    }

    if (method === 'GET') {
        bodyForSign = querystring.stringify(effectiveParamsOrData);
        requestConfig.params = effectiveParamsOrData;
    } else if (method === 'POST') {
        // CORRECCIÓN CLAVE: Ordenar las claves antes de JSON.stringify
        const sortedParamsOrData = sortObjectKeys(effectiveParamsOrData);
        bodyForSign = JSON.stringify(sortedParamsOrData);
        requestConfig.data = sortedParamsOrData; // También enviar el objeto ordenado en la data de la solicitud
        requestConfig.headers['Content-Type'] = 'application/json';
    }

    if (isPrivate) {
        if (!apiKey || !secretKey || (apiMemo === undefined || apiMemo === null)) {
            throw new Error("Credenciales de BitMart API (API Key, Secret, Memo) no proporcionadas para una solicitud privada. Asegúrate de que el usuario haya configurado sus claves.");
        }
        
        const sign = generateSign(timestamp, apiMemo, bodyForSign, secretKey);

        // Logs de depuración de headers
        console.log(`[REQUEST_HEADERS_DEBUG] X-BM-KEY: ${apiKey.substring(0,5)}... (Length: ${apiKey.length})`);
        console.log(`[REQUEST_HEADERS_DEBUG] X-BM-TIMESTAMP: ${timestamp}`);
        console.log(`[REQUEST_HEADERS_DEBUG] X-BM-SIGN: ${sign}`);
        console.log(`[REQUEST_HEADERS_DEBUG] X-BM-MEMO: '${apiMemo}' (Length: ${apiMemo.length})`);

        requestConfig.headers['X-BM-KEY'] = apiKey;
        requestConfig.headers['X-BM-TIMESTAMP'] = timestamp;
        requestConfig.headers['X-BM-SIGN'] = sign;
        requestConfig.headers['X-BM-MEMO'] = apiMemo;
    }

    console.log(`\n--- Realizando solicitud ${method} a ${path} ---`);
    console.log(`URL: ${url}`);
    if (method === 'POST') {
        console.log('Body enviado (original):', JSON.stringify(paramsOrData)); // Mostrar el original para referencia
        console.log('Body para Firma (JSON ordenado):', bodyForSign); // Mostrar el ordenado para firma
    } else {
        console.log('Query Params:', JSON.stringify(effectiveParamsOrData));
    }

    try {
        const response = await axios({
            method: method,
            url: url,
            ...requestConfig
        });

        if (response.data && response.data.code === 1000) {
            return response.data;
        } else {
            console.error(`❌ Error en la respuesta de la API de BitMart para ${path}:`, JSON.stringify(response.data, null, 2));
            throw new Error(`Error de BitMart API: ${response.data.message || 'Respuesta inesperada'} (Code: ${response.data.code || 'N/A'})`);
        }
    } catch (error) {
        console.error(`\n❌ Falló la solicitud a ${path}.`);
        if (error.response) {
            console.error('Error Data:', JSON.stringify(error.response.data, null, 2));
            console.error('Error Status:', error.response.status);
            console.error('Error Headers:', error.response.headers);
            throw new Error(`Error de la API de BitMart: ${JSON.stringify(error.response.data)} (Status: ${error.response.status})`);
        } else if (error.request) {
            console.error('Error Request: No se recibió respuesta. ¿Problema de red o firewall?');
            throw new Error('No se recibió respuesta de BitMart API. Posible problema de red, firewall o la API no está disponible.');
        } else {
            console.error('Error Message:', error.message);
            throw new Error(`Error desconocido al procesar la solicitud: ${error.message}`);
        }
    }
}

/**
 * Obtiene la hora del servidor de BitMart (API pública).
 * @returns {Promise<string>} - Promesa que resuelve con el timestamp del servidor en milisegundos.
 */
async function getSystemTime() {
    console.log('\n--- Obteniendo Hora del Servidor BitMart (Público) ---');
    try {
        // makeRequest con isPrivate=false para este endpoint público
        const response = await makeRequest('GET', '/spot/v1/time', {}, false);
        if (response && response.code === 1000 && response.data && response.data.server_time) {
            const serverTime = response.data.server_time.toString(); // Asegurar que sea string
            console.log(`✅ Hora del servidor BitMart obtenida: ${serverTime} (${new Date(parseInt(serverTime)).toISOString()})`);
            return serverTime;
        } else {
            console.error('❌ Respuesta inesperada al obtener la hora del servidor:', JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada de BitMart al obtener hora del servidor: ${JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error('❌ Error al obtener la hora del servidor de BitMart:', error.message);
        throw error;
    }
}

/**
 * Obtiene el precio (ticker) de un símbolo específico. (Público)
 * @param {string} symbol - Par de trading, ej: "BTC_USDT"
 * @returns {Promise<object>} - Promesa que resuelve con los datos del ticker.
 */
async function getTicker(symbol) {
    try {
        const url = `/spot/quotation/v3/ticker`;
        const params = { symbol: symbol };
        console.log(`--- Solicitud GET Ticker para ${symbol} ---`);
        const response = await makeRequest('GET', url, params, false);
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
 * Obtiene el balance de la cuenta del usuario. (Privado)
 * @param {object} authCredentials - Objeto con { apiKey, secretKey, apiMemo } del usuario actual.
 * @returns {Promise<object[]>} - Promesa que resuelve con un array de objetos de balance.
 */
async function getBalance(authCredentials) {
    console.log('\n--- Obteniendo Balance de la Cuenta ---');
    try {
        const serverTime = await getSystemTime(); // Obtener la hora del servidor de BitMart
        const response = await makeRequest('GET', '/account/v1/wallet', {}, true, authCredentials, serverTime);
        if (response && response.code === 1000 && response.data && response.data.wallet) {
            console.log('✅ Balance de la cuenta obtenido con éxito.', response.data.wallet);
            return response.data.wallet;
        } else {
            console.error('❌ Falló la obtención del balance de la cuenta. Respuesta inesperada:', JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada al obtener balance de BitMart: ${JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error('\n❌ Error al obtener balance de la cuenta:', error.message);
        throw error;
    }
}

/**
 * Obtiene la lista de órdenes spot abiertas usando el endpoint v4 POST. (Privado)
 * @param {object} authCredentials - Objeto con { apiKey, secretKey, apiMemo } del usuario actual.
 * @param {string} [symbol] - Símbolo del par de trading, ej: "BTC_USDT". Opcional.
 * @returns {Promise<object>} - Promesa que resuelve con un objeto que contiene 'orders'.
 */
async function getOpenOrders(authCredentials, symbol) {
    console.log(`\n--- Obteniendo Órdenes Abiertas (V4 POST) para ${symbol || 'todos los símbolos'} ---`);
    const path = '/spot/v4/query/open-orders';
    const requestBody = {};
    if (symbol) { requestBody.symbol = symbol; }
    try {
        const serverTime = await getSystemTime(); // Obtener la hora del servidor de BitMart
        const response = await makeRequest('POST', path, requestBody, true, authCredentials, serverTime);
        const responseData = response.data;
        let orders = [];
        if (Array.isArray(responseData)) {
            orders = responseData;
        } else if (responseData && Array.isArray(responseData.list)) {
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
        return { orders: orders }; // Devolver siempre un objeto con la propiedad 'orders'
    } catch (error) {
        console.error('\n❌ Falló la obtención de órdenes abiertas V4.');
        throw error;
    }
}


/**
 * Obtiene el detalle de una orden específica. (Privado)
 * @param {object} authCredentials - Objeto con { apiKey, secretKey, apiMemo } del usuario actual.
 * @param {string} symbol - Par de trading.
 * @param {string} orderId - ID de la orden.
 * @returns {Promise<object>} - Promesa que resuelve con los detalles de la orden.
 */
async function getOrderDetail(authCredentials, symbol, orderId) {
    console.log(`\n--- Obteniendo Detalle de Orden ${orderId} para ${symbol} (V4 POST) ---`);
    const requestBody = { symbol: symbol, orderId: orderId };
    try {
        const serverTime = await getSystemTime(); // Obtener la hora del servidor de BitMart
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
 * Coloca una orden de compra (BUY) o venta (SELL) en el mercado spot. (Privado)
 * @param {object} authCredentials - Objeto con { apiKey, secretKey, apiMemo } del usuario actual.
 * @param {string} symbol - Par de trading.
 * @param {string} side - "buy" o "sell".
 * @param {string} type - "limit" o "market".
 * @param {string} size - Cantidad de la moneda base a comprar/vender.
 * @param {string} [price] - Precio de la orden (requerido para órdenes "limit").
 * @returns {Promise<object>} - Promesa que resuelve con la respuesta de la la orden.
 */
async function placeOrder(authCredentials, symbol, side, type, size, price) {
    console.log(`[DEBUG_BITMART_SERVICE] placeOrder - symbol: ${symbol}, side: ${side}, type: ${type}, size: ${size}`);
    console.log(`\n--- Colocando Orden ${side.toUpperCase()} de ${size} ${symbol} (${type}) ---`);
    const requestBody = { symbol: symbol, side: side, type: type };

    if (type === 'limit') {
        if (!price) { throw new Error("El precio es requerido para órdenes de tipo 'limit'."); }
        requestBody.size = size.toString();
        requestBody.price = price.toString();
    } else if (type === 'market') {
        if (side === 'buy') {
            requestBody.notional = size.toString(); // Notional for market BUY
        } else if (side === 'sell') {
            requestBody.size = size.toString(); // Size for market SELL
        } else {
            throw new Error(`Tipo de orden no soportado para side: ${side} y type: ${type}`);
        }
    } else { throw new Error(`Tipo de orden no soportado: ${type}`); }

    console.log('DEBUG: requestBody antes de makeRequest:', requestBody);
    try {
        const serverTime = await getSystemTime(); // Obtener la hora del servidor de BitMart
        const response = await makeRequest('POST', '/spot/v2/submit_order', requestBody, true, authCredentials, serverTime);
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Orden colocada con éxito:`, response.data);
            return response.data;
        } else {
            console.error(`❌ Falló la colocación de la orden. Respuesta inesperada:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada al colocar orden de BitMart: ${response.data.message || JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error('\n❌ Error al colocar la orden:', error.message);
        throw error;
    }
}

/**
 * Cancela una orden pendiente por su ID. (Privado)
 * @param {object} authCredentials - Objeto con { apiKey, secretKey, apiMemo } del usuario actual.
 * @param {string} symbol - El símbolo del par de trading de la orden.
 * @param {string} order_id - El ID de la orden a cancelar.
 * @returns {Promise<object>} - Promesa que resuelve con la respuesta de la cancelación.
 */
async function cancelOrder(authCredentials, symbol, order_id) {
    console.log(`\n--- Cancelando Orden ${order_id} para ${symbol} ---`);
    const requestBody = { symbol: symbol, order_id: order_id };
    try {
        const serverTime = await getSystemTime(); // Obtener la hora del servidor de BitMart
        const response = await makeRequest('POST', '/spot/v2/cancel-order', requestBody, true, authCredentials, serverTime);
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Orden ${order_id} cancelada con éxito.`);
            return response.data;
        } else {
            console.error(`❌ Falló la cancelación de la orden. Respuesta inesperada:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada al cancelar orden de BitMart: ${response.data.message || JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error('\n❌ Error al cancelar la orden:', error.message);
        throw error;
    }
}

/**
 * Obtiene la lista de órdenes spot históricas (completadas, canceladas, etc.). (Privado)
 * @param {object} authCredentials - Objeto con { apiKey, secretKey, apiMemo } del usuario actual.
 * @param {object} options - Objeto con opciones de filtrado (symbol, orderMode, startTime, endTime, limit).
 * @returns {Promise<object[]>} - Promesa que resuelve con un array de órdenes o un error.
 */
async function getHistoryOrdersV4(authCredentials, options = {}) {
    console.log(`\n--- Listando Historial de Órdenes (V4 POST) ---`);
    const path = '/spot/v4/query/history-orders';
    const requestBody = {};
    if (options.symbol) { requestBody.symbol = options.symbol; }
    if (options.orderMode) { requestBody.orderMode = options.orderMode; } // e.g., 'spot'
    if (options.startTime) { requestBody.startTime = options.startTime; }
    if (options.endTime) { requestBody.endTime = options.endTime; }
    if (options.limit) { requestBody.limit = options.limit; }
    try {
        const serverTime = await getSystemTime(); // Obtener la hora del servidor de BitMart
        const response = await makeRequest('POST', path, requestBody, true, authCredentials, serverTime);
        const responseData = response.data;
        let orders = [];
        if (Array.isArray(responseData)) {
            orders = responseData;
        } else if (responseData && Array.isArray(responseData.list)) {
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
        return orders;
    } catch (error) {
        console.error('\n❌ Falló la obtención del historial de órdenes V4.');
        throw error;
    }
}

/**
 * Valida las credenciales API de BitMart proporcionadas.
 * @param {string} apiKey - La API Key a validar.
 * @param {string} secretKey - La Secret Key a validar.
 * @param {string} apiMemo - El API Memo a validar.
 * @returns {Promise<boolean>} - True si las credenciales son válidas y la conexión es exitosa, false en caso contrario.
 */
async function validateApiKeys(apiKey, secretKey, apiMemo) {
    console.log('\n--- Iniciando validación de credenciales API de BitMart ---');
    if (!apiKey || !secretKey || (apiMemo === undefined || apiMemo === null)) {
        console.error("ERROR: API Key, Secret Key o API Memo no proporcionados para validación (uno es null/undefined).");
        return false;
    }

    try {
        // Al llamar a getBalance, pasamos las credenciales para que makeRequest las use
        await getBalance({ apiKey, secretKey, apiMemo });
        console.log('✅ Credenciales API de BitMart validadas con éxito. CONECTADO.');
        return true;
    } catch (error) {
        console.error('❌ Falló la validación de credenciales API de BitMart:', error.message);
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
    getKlines, // Asegúrate de que getKlines esté definida antes de este punto
    validateApiKeys, // Asegúrate de que validateApiKeys esté definida antes de este punto
    getSystemTime,
};
