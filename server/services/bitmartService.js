// ./services/bitmartService.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const querystring = require('querystring');

const BASE_URL = 'https://api-cloud.bitmart.com';

/**
 * Genera la firma para la solicitud a la API de BitMart.
 * @param {string} timestamp - Timestamp actual en milisegundos.
 * @param {string} memo - El memo de la API (X-BM-MEMO).
 * @param {string} bodyOrQueryString - El cuerpo stringificado JSON (para POST) o la query string (para GET).
 * @param {string} apiSecret - La clave secreta de la API a usar para la firma.
 * @returns {string} - Firma HMAC SHA256.
 */
function generateSign(timestamp, memo, bodyOrQueryString, apiSecret) {
    const message = timestamp + '#' + memo + '#' + bodyOrQueryString;
    return CryptoJS.HmacSHA256(message, apiSecret).toString(CryptoJS.enc.Hex);
}

/**
 * Función genérica para realizar solicitudes a la API de BitMart.
 * @param {string} method - Método HTTP ('GET' o 'POST').
 * @param {string} path - Ruta del endpoint.
 * @param {object} [paramsOrData={}] - Parámetros para GET o cuerpo para POST.
 * @param {boolean} [isPrivate=true] - Si la solicitud requiere autenticación.
 * @param {object} [authCredentials={}] - REQUERIDO para solicitudes privadas: Objeto con { apiKey, secretKey, apiMemo }.
 * @returns {Promise<object>} - Promesa que resuelve con los datos de la respuesta.
 */
async function makeRequest(method, path, paramsOrData = {}, isPrivate = true, authCredentials = {}) {
    const timestamp = Date.now().toString();
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
        // recvWindow is often a GET parameter, but BitMart API sometimes requires it in POST body.
        // For consistency and general case, it's included in effectiveParamsOrData
        // and then stringified or JSON.stringified as needed.
        effectiveParamsOrData.recvWindow = 10000;
    }

    if (method === 'GET') {
        bodyForSign = querystring.stringify(effectiveParamsOrData);
        requestConfig.params = effectiveParamsOrData;
    } else if (method === 'POST') {
        bodyForSign = JSON.stringify(effectiveParamsOrData);
        requestConfig.data = effectiveParamsOrData;
        requestConfig.headers['Content-Type'] = 'application/json';
    }

    if (isPrivate) {
        if (!apiKey || !secretKey || !apiMemo) {
            throw new Error("Credenciales de BitMart API (API Key, Secret, Memo) no proporcionadas para una solicitud privada. Asegúrate de que el usuario haya configurado sus claves.");
        }
        const sign = generateSign(timestamp, apiMemo, bodyForSign, secretKey);
        requestConfig.headers['X-BM-KEY'] = apiKey;
        requestConfig.headers['X-BM-TIMESTAMP'] = timestamp;
        requestConfig.headers['X-BM-SIGN'] = sign;
        requestConfig.headers['X-BM-MEMO'] = apiMemo;
    }

    console.log(`\n--- Realizando solicitud ${method} a ${path} ---`);
    console.log(`URL: ${url}`);
    if (method === 'POST') {
        console.log('Body enviado:', JSON.stringify(effectiveParamsOrData));
    } else {
        console.log('Query Params:', JSON.stringify(effectiveParamsOrData));
    }

    try {
        const response = await axios({
            method: method,
            url: url,
            ...requestConfig
        });

        // BitMart API generally returns { code: 1000, message: "OK", data: ... } on success.
        // We'll return the whole response.data object for the caller to parse.
        if (response.data && response.data.code === 1000) {
            return response.data; // Return the entire response.data from BitMart
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
        // BitMart's ticker response might be under response.data.data
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Ticker para ${symbol} obtenido con éxito.`);
            return response.data; // This data often contains a 'ticker' array or similar
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
        const response = await makeRequest('GET', '/account/v1/wallet', {}, true, authCredentials);
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
 * @returns {Promise<object[]>} - Promesa que resuelve con un array de órdenes o un error.
 */
async function getOpenOrders(authCredentials, symbol) {
    console.log(`\n--- Obteniendo Órdenes Abiertas (V4 POST) para ${symbol || 'todos los símbolos'} ---`);
    const path = '/spot/v4/query/open-orders';
    const requestBody = {};
    if (symbol) { requestBody.symbol = symbol; }
    try {
        const response = await makeRequest('POST', path, requestBody, true, authCredentials);
        const responseData = response.data; // This is the 'data' property from BitMart's outer response
        let orders = [];
        if (Array.isArray(responseData)) { // Sometimes response.data is directly the list
            orders = responseData;
        } else if (responseData && Array.isArray(responseData.list)) { // Other times, it's under a 'list' property
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
        return orders;
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
        const response = await makeRequest('POST', '/spot/v4/query/order-detail', requestBody, true, authCredentials);
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
 * @returns {Promise<object>} - Promesa que resuelve con la respuesta de la orden.
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
            // For market BUY, BitMart API often expects 'notional' (quote currency amount, e.g., USDT amount)
            // or sometimes 'client_order_id' to differentiate. 'size' is usually base currency.
            // Check BitMart docs for exact requirement. Using notional for market buy.
            requestBody.notional = size.toString();
        } else if (side === 'sell') {
            // For market SELL, BitMart API often expects 'size' (base currency amount, e.g., BTC amount)
            requestBody.size = size.toString();
        } else {
            throw new Error(`Tipo de orden no soportado para side: ${side} y type: ${type}`);
        }
    } else { throw new Error(`Tipo de orden no soportado: ${type}`); }

    console.log('DEBUG: requestBody antes de makeRequest:', requestBody);
    try {
        const response = await makeRequest('POST', '/spot/v2/submit_order', requestBody, true, authCredentials);
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
        const response = await makeRequest('POST', '/spot/v2/cancel-order', requestBody, true, authCredentials);
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
    const requestBody = {};
    if (options.symbol) { requestBody.symbol = options.symbol; }
    if (options.orderMode) { requestBody.orderMode = options.orderMode; } // e.g., 'spot'
    if (options.startTime) { requestBody.startTime = options.startTime; }
    if (options.endTime) { requestBody.endTime = options.endTime; }
    if (options.limit) { requestBody.limit = options.limit; }
    try {
        const response = await makeRequest('POST', '/spot/v4/query/history-orders', requestBody, true, authCredentials);
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
 * Obtiene la hora del servidor de BitMart (API pública).
 * @returns {Promise<number>} - Promesa que resuelve con el timestamp del servidor.
 */
async function getSystemTime() {
    console.log('\n--- Obteniendo Hora del Servidor BitMart (Público) ---');
    try {
        const response = await makeRequest('GET', '/spot/v1/time', {}, false);
        if (response && response.code === 1000 && response.data && response.data.server_time) {
            const serverTime = parseInt(response.data.server_time);
            console.log(`✅ Hora del servidor BitMart obtenida: ${serverTime} (${new Date(serverTime).toISOString()})`);
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
 * Valida las credenciales API de BitMart proporcionadas.
 * @param {string} apiKey - La API Key a validar.
 * @param {string} secretKey - La Secret Key a validar.
 * @param {string} apiMemo - El API Memo a validar.
 * @returns {Promise<boolean>} - True si las credenciales son válidas y la conexión es exitosa, false en caso contrario.
 */
async function validateApiKeys(apiKey, secretKey, apiMemo) {
    console.log('\n--- Iniciando validación de credenciales API de BitMart ---');
    if (!apiKey || !secretKey || !apiMemo) {
        console.error("ERROR: API Key, Secret Key o API Memo no proporcionados para validación.");
        return false;
    }

    try {
        // Para la validación inicial, pasamos las claves recibidas directamente
        await getBalance({ apiKey, secretKey, apiMemo });
        console.log('✅ Credenciales API de BitMart validadas con éxito. CONECTADO.');
        return true;
    } catch (error) {
        console.error('❌ Falló la validación de credenciales API de BitMart:', error.message);
        return false;
    }
}

/**
 * Obtiene datos de velas (OHLCV) para un símbolo y período de tiempo. (Público)
 * @param {string} symbol - Par de trading.
 * @param {string} interval - Intervalo de las velas (e.g., "1m", "5m", "1H", "1D").
 * @param {number} [limit=200] - Número de velas a obtener (máx. 200).
 * @returns {Promise<Array<Object>>} - Promesa que resuelve con un array de objetos de vela.
 */
async function getKlines(symbol, interval, limit = 200) {
    console.log(`\n--- Solicitud GET Klines (Candlesticks) para ${symbol}, intervalo ${interval}, ${limit} velas ---`);
    const path = `/spot/quotation/v3/klines`;
    const params = { symbol: symbol, step: interval, size: limit };
    try {
        const response = await makeRequest('GET', path, params, false);
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