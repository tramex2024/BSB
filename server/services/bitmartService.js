// server/services/bitmartService.js 

const axios = require('axios');
const CryptoJS = require('crypto-js');
const querystring = require('querystring');

const BASE_URL = 'https://api-cloud.bitmart.com';

const DEFAULT_V4_POST_MEMO = 'GainBot';

function sortObjectKeys(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sortObjectKeys(item));
    }

    const sortedKeys = Object.keys(obj).sort();
    const sortedObj = {};
    for (const key of sortedKeys) {
        sortedObj[key] = sortObjectKeys(obj[key]);
    }
    return sortedObj;
}

function generateSign(timestamp, memo, bodyOrQueryString, apiSecret) {
    const memoForHash = (memo === null || memo === undefined) ? '' : String(memo);
    const finalBodyOrQueryString = bodyOrQueryString || '';

    let message;
    if (memoForHash === '') {
        message = timestamp + '#' + finalBodyOrQueryString;
    } else {
        message = timestamp + '#' + memoForHash + '#' + finalBodyOrQueryString;
    }

    console.log(`[SIGN_DEBUG] Timestamp: '${timestamp}'`);
    console.log(`[SIGN_DEBUG] Memo used for hash: '${memoForHash}' (Original memo value: ${memo})`);
    console.log(`[SIGN_DEBUG] Body/Query String for Sign: '${finalBodyOrQueryString}' (Length: ${finalBodyOrQueryString.length})`);
    console.log(`[SIGN_DEBUG] Message to Hash: '${message}' (Length: ${message.length})`);

    // --- LOG DE EXTREMA SENSIBILIDAD ---
    // ESTO REVELARÁ TU CLAVE SECRETA COMPLETA EN LOS LOGS DEL SERVIDOR.
    // ¡ÚSALO SOLO PARA DEPURACIÓN EN UN ENTORNO SEGURO Y ELIMÍNALO INMEDIATAMENTE DESPUÉS!
    console.log(`[SIGN_DEBUG] FULL API Secret (for hash): '${apiSecret}' (Length: ${apiSecret.length})`); 
    // --- FIN LOG DE EXTREMA SENSIBILIDAD ---

    return CryptoJS.HmacSHA256(message, apiSecret).toString(CryptoJS.enc.Hex);
}

async function makeRequest(method, path, paramsOrData = {}, isPrivate = true, authCredentials = {}, timestampOverride) {
    const timestamp = timestampOverride || Date.now().toString();
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

    let apiMemoForRequestAndSign = apiMemo;
    if (method === 'POST' && path.includes('/v4/') && (apiMemo === '' || apiMemo === null || apiMemo === undefined)) {
        apiMemoForRequestAndSign = DEFAULT_V4_POST_MEMO;
        console.warn(`[API_MEMO_WORKAROUND] Using default memo '${DEFAULT_V4_POST_MEMO}' for V4 POST request '${path}' as user's memo is blank.`);
    }

    let dataForRequest = { ...paramsOrData }; // Clona paramsOrData

    if (isPrivate) {
        requestConfig.headers['X-BM-RECVWINDOW'] = 10000;
    }

    if (method === 'GET') {
        if (isPrivate) {
            dataForRequest.recvWindow = 10000;
        }
        requestConfig.params = sortObjectKeys(dataForRequest); // Ordena los parámetros para GET
        bodyForSign = querystring.stringify(requestConfig.params);
    } else if (method === 'POST') {
        // --- CAMBIO CLAVE AQUÍ ---
        // 1. Ordena las claves del objeto antes de stringificarlo para la firma.
        const sortedDataForRequest = sortObjectKeys(dataForRequest);
        
        // 2. Usa el objeto ordenado para el cuerpo de la solicitud real.
        requestConfig.data = sortedDataForRequest; 
        
        // 3. Stringifica el objeto ordenado para la firma.
        bodyForSign = JSON.stringify(sortedDataForRequest); 
        // --- FIN CAMBIO CLAVE ---

        requestConfig.headers['Content-Type'] = 'application/json';
    }

    if (isPrivate) {
        if (!apiKey || !secretKey || (apiMemo === undefined || apiMemo === null)) {
            throw new Error("Credenciales de BitMart API (API Key, Secret, Memo) no proporcionadas para una solicitud privada. Asegúrate de que el user haya configurado sus claves.");
        }

        const sign = generateSign(timestamp, apiMemoForRequestAndSign, bodyForSign, secretKey);

        requestConfig.headers['X-BM-KEY'] = apiKey;
        requestConfig.headers['X-BM-TIMESTAMP'] = timestamp;
        requestConfig.headers['X-BM-SIGN'] = sign;

        if (apiMemoForRequestAndSign !== undefined && apiMemoForRequestAndSign !== null) {
            requestConfig.headers['X-BM-MEMO'] = apiMemoForRequestAndSign;
        } else {
            delete requestConfig.headers['X-BM-MEMO'];
        }
    }

    console.log(`\n--- Realizando solicitud ${method} a ${path} ---`);
    console.log(`URL: ${url}`);
    if (method === 'POST') {
        // Asegúrate de que aquí se imprima el body ordenado para depuración
        console.log('Body enviado (para solicitud):', JSON.stringify(requestConfig.data)); 
        console.log('Body para Firma (JSON stringificado):', bodyForSign);
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

        if (response.data && response.data.code === 1000) {
            return response.data;
        } else {
            console.error(`❌ Error en la respuesta de la API de BitMart para ${path}:`, JSON.stringify(response.data, null, 2));
            throw new Error(`Error de BitMart API: ${response.data.message || response.data.error_msg || 'Respuesta inesperada'} (Code: ${response.data.code || 'N/A'})`);
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
async function getSystemTime() {
    console.log('\n--- Obteniendo Hora del Servidor BitMart (Público) ---');
    try {
        const response = await makeRequest('GET', '/system/time', {}, false);
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

async function getBalance(authCredentials) {
    console.log('\n--- Obteniendo Balance de la Cuenta ---');
    try {
        const serverTime = await getSystemTime();
        const response = await makeRequest('GET', '/account/v1/wallet', {}, true, authCredentials, serverTime);
        if (response && response.code === 1000 && response.data && response.data.wallet) {
            console.log('✅ Balance de la cuenta obtenido con éxito.', response.data.wallet);
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

async function getOpenOrders(authCredentials, symbol) {
    console.log(`\n--- Obteniendo Órdenes Abiertas (V4 POST) para ${symbol || 'todos los símbolos'} ---`);
    const path = '/spot/v4/query/open-orders';
    const requestBody = {};
    if (symbol) { requestBody.symbol = symbol; }
    try {
        const serverTime = await getSystemTime();
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
        // BitMart's open orders endpoint doesn't return a 'status' field typically.
        // For consistency in the frontend, you might want to add one here if your frontend strictly expects it.
        // However, the `updateOrderElement` in main.js now handles the absence of 'status' for 'opened' tab.
        return { orders: orders };
    } catch (error) {
        console.error('\n❌ Falló la obtención de órdenes abiertas V4.');
        throw error;
    }
}


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
            requestBody.notional = size.toString();
        } else if (side === 'sell') {
            requestBody.size = size.toString();
        } else {
            throw new Error(`Tipo de orden no soportado para side: ${side} y type: ${type}`);
        }
    } else { throw new Error(`Tipo de orden no soportado: ${type}`); }

    console.log('DEBUG: requestBody antes de makeRequest:', requestBody);
    try {
        const serverTime = await getSystemTime();
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

async function cancelOrder(authCredentials, symbol, order_id) {
    console.log(`\n--- Cancando Orden ${order_id} para ${symbol} ---`);
    const requestBody = { symbol: symbol, order_id: order_id };
    try {
        const serverTime = await getSystemTime();
        const response = await makeRequest('POST', '/spot/v2/cancel-order', requestBody, true, authCredentials, serverTime);
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Orden ${order_id} cancelada con éxito.`);
            return response.data;
        } else {
            console.error(`❌ Falló la cancelación de la orden. Respuesta inesperada:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada al cancelar orden de BitMart: ${response.data.message || response.data.error_msg || JSON.stringify(response)}`);
        }
    } catch (error) {
        console.error('\n❌ Error al cancelar la orden:', error.message);
        throw error;
    }
}

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
        const response = await makeRequest('POST', path, requestBody, true, authCredentials, serverTime);
        const responseData = response.data;
        let orders = [];
        // BitMart a veces devuelve el array directamente en 'data' y a veces lo anida en 'data.list'.
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

async function validateApiKeys(apiKey, secretKey, apiMemo) {
    console.log('\n--- Iniciando validación de credenciales API de BitMart ---');
    if (!apiKey || !secretKey || (apiMemo === undefined || apiMemo === null)) {
        console.error("ERROR: API Key, Secret Key o API Memo no proporcionados para validación (uno es null/undefined).");
        return false;
    }

    try {
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
    getKlines,
    validateApiKeys,
    getSystemTime,
};