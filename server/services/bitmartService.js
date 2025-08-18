const axios = require('axios');
const CryptoJS = require('crypto-js');
const querystring = require('querystring');
require('dotenv').config();

const BASE_URL = 'https://api-cloud.bitmart.com';
const API_URL = 'https://api-cloud.bitmart.com';
const DEFAULT_V4_POST_MEMO = 'GainBot';

// Constantes para los reintentos
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 500;
const RETRY_ERROR_CODES = [30000];

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
    return CryptoJS.HmacSHA256(message, apiSecret).toString(CryptoJS.enc.Hex);
}

// **Función makeRequest CORREGIDA**
// La función makeRequest está CORREGIDA
// La función makeRequest está CORREGIDA
async function makeRequest(credentials, method, endpoint, params = {}, body = {}) {
    const isPrivate = credentials && credentials.apiKey && credentials.secretKey;

    const url = `${API_URL}${endpoint}`;
    const headers = {
        'User-Agent': 'axios/1.9.0',
        'Accept': 'application/json, text/plain, */*',
    };

    let requestBodyString = '';
    if (method.toUpperCase() === 'POST' && body && Object.keys(body).length > 0) {
        requestBodyString = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
    }

    if (isPrivate) {
        const timestamp = Date.now().toString();
        const memo = credentials.memo || "GainBot";
        let messageToSign;
        
        if (method.toUpperCase() === 'POST') {
            messageToSign = `${timestamp}#${memo}#${requestBodyString}`;
        } else {
            const sortedParams = sortObjectKeys(params);
            const queryString = querystring.stringify(sortedParams);
            messageToSign = `${timestamp}#${memo}#${queryString}`;
        }
        
        const signature = CryptoJS.HmacSHA256(messageToSign, credentials.secretKey).toString(CryptoJS.enc.Hex);
        
        headers['X-BM-KEY'] = credentials.apiKey;
        headers['X-BM-SIGN'] = signature;
        headers['X-BM-TIMESTAMP'] = timestamp;
        if (memo) {
             headers['X-BM-MEMO'] = memo;
        }
    }

    const requestOptions = {
        method,
        url,
        headers,
        data: requestBodyString,
        params: params
    };

    try {
        const response = await axios(requestOptions);
        return response.data;
    } catch (error) {
        console.error(`Error en la solicitud a ${url}:`, error.message);
        throw error;
    }
}
// **Funciones CORREGIDAS**
async function getSystemTime() {
    try {
        const response = await makeRequest(null, 'GET', '/system/time');
        return response.data.server_time;
    } catch (error) {
        console.error('Error al obtener la hora del servidor de BitMart:', error.message);
        throw error;
    }
}

async function getTicker(symbol) {
    try {
        const endpoint = `/spot/v1/ticker`;
        const response = await makeRequest(null, 'GET', endpoint, { symbol });
        return response.data.tickers.find(t => t.symbol === symbol);
    } catch (error) {
        console.error(`Falló la solicitud a getTicker para ${symbol}.`);
        throw error;
    }
}

async function getBalance(authCredentials) {
    console.log('\n--- Obteniendo Balance de la Cuenta ---');
    try {
        const response = await makeRequest(authCredentials, 'GET', '/account/v1/wallet');
        if (response && response.code === 1000 && response.data && response.data.wallet) {
            console.log('✅ Balance de la cuenta obtenido con éxito.');
            response.data.wallet.forEach(balance => {
                console.log(`   - ${balance.currency}: Disponible ${balance.available}, Congelado ${balance.frozen}`);
            });
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
        const response = await makeRequest(authCredentials, 'POST', path, {}, requestBody);
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
            orders.forEach(order => console.log(`   - Order ID: ${order.order_id}, Símbolo: ${order.symbol}, Lado: ${order.side}, Tipo: ${order.type}, Estado: ${order.state}`));
        } else {
            console.log('ℹ️ No se encontraron órdenes abiertas con los criterios especificados (o no tienes órdenes abiertas actualmente).');
            console.log("DEBUG: Respuesta completa si no se encuentran órdenes:", JSON.stringify(responseData, null, 2));
        }
        return { orders: orders };
    } catch (error) {
        console.error('\n❌ Falló la obtención de órdenes abiertas V4.');
        throw error;
    }
}

async function getOrderDetail(authCredentials, symbol, orderId, retries = 0, delay = INITIAL_RETRY_DELAY_MS) {
    console.log(`\n--- Obteniendo Detalle de Orden ${orderId} para ${symbol} (V4 POST) ---`);
    const requestBody = { symbol: symbol, orderId: orderId };
    
    if (retries >= MAX_RETRIES) {
        throw new Error(`Fallaron ${MAX_RETRIES} reintentos al obtener detalles de la orden ${orderId}. La orden no se encontró o sigue pendiente.`);
    }

    try {
        const response = await makeRequest(authCredentials, 'POST', '/spot/v4/query/order-detail', {}, requestBody);
        if (response && response.code === 1000 && response.data) {
            console.log(`✅ Detalle de orden ${orderId} obtenido con éxito:`);
            console.log(`   - Order ID: ${response.data.order_id}, Símbolo: ${response.data.symbol}, Lado: ${response.data.side}, Tipo: ${response.data.type}, Estado: ${response.data.state}`);
            return response.data;
        } else {
            console.error(`❌ Falló la obtención del detalle de la orden. Respuesta inesperada:`, JSON.stringify(response, null, 2));
            throw new Error(`Respuesta inesperada al obtener detalle de orden de BitMart: ${JSON.stringify(response)}`);
        }
    } catch (error) {
        const errorMessage = error.message;
        const isNotFound = RETRY_ERROR_CODES.some(code => errorMessage.includes(`Code: ${code}`));
        const isNotFoundStatus = errorMessage.includes(`Status: 404`);

        if ((isNotFound || isNotFoundStatus) && retries < MAX_RETRIES) {
            console.warn(`[RETRY] Orden ${orderId} no encontrada aún (Error: ${errorMessage}). Reintento ${retries + 1}/${MAX_RETRIES} en ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return getOrderDetail(authCredentials, symbol, orderId, retries + 1, delay * 1.5);
        } else {
            console.error('\n❌ Error al obtener el detalle de la orden (sin reintentos o max retries alcanzado):', errorMessage);
            throw error;
        }
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
        const response = await makeRequest(authCredentials, 'POST', '/spot/v2/submit_order', {}, requestBody);
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
        const response = await makeRequest(authCredentials, 'POST', '/spot/v2/cancel-order', {}, requestBody);
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
        const response = await makeRequest(authCredentials, 'POST', path, {}, requestBody);
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
            orders.forEach(order => console.log(`   - Order ID: ${order.order_id}, Símbolo: ${order.symbol}, Lado: ${order.side}, Tipo: ${order.type}, Estado: ${order.state}`));
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
        const response = await makeRequest(null, 'GET', path, params);
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
    const authCredentials = { apiKey, secretKey, apiMemo };
    try {
        await getBalance(authCredentials);
        console.log('✅ Credenciales API de BitMart validadas con éxito. CONECTADO.');
        return true;
    } catch (error) {
        console.error('❌ Falló la validación de credenciales API de BitMart:', error.message);
        return false;
    }
}

// --- Funciones de Orquestación de Órdenes (Simplificadas) ---
const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5;

async function cancelAllOpenOrders(bitmartCreds, symbol) {
    console.log(`[BITMART_SERVICE] Intentando cancelar órdenes abiertas para ${symbol}...`);
    try {
        const openOrders = await getOpenOrders(bitmartCreds, symbol);
        if (openOrders && openOrders.orders && openOrders.orders.length > 0) {
            for (const order of openOrders.orders) {
                console.log(`[BITMART_SERVICE] Cancelando orden: ${order.order_id}`);
                await cancelOrder(bitmartCreds, symbol, order.order_id);
                console.log(`[BITMART_SERVICE] Orden ${order.order_id} cancelada.`);
            }
            console.log(`[BITMART_SERVICE] Todas las ${openOrders.orders.length} órdenes abiertas para ${symbol} han sido canceladas.`);
        } else {
            console.log('[BITMART_SERVICE] No se encontraron órdenes abiertas para cancelar.');
        }
    } catch (error) {
        console.error('[BITMART_SERVICE] Error al cancelar órdenes abiertas:', error.message);
        throw error;
    }
}

async function placeFirstBuyOrder(authCredentials, symbol, purchaseAmountUsdt, currentPrice) {
    console.log(`[BITMART_SERVICE] Colocando la primera orden de compra (Market)...`);
    const side = 'buy';
    const type = 'market';

    const balanceInfo = await getBalance(authCredentials);
    const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available || 0) : 0;

    if (purchaseAmountUsdt < MIN_USDT_VALUE_FOR_BITMART) {
        throw new Error(`El valor de la orden (${purchaseAmountUsdt.toFixed(2)} USDT) es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART} USDT). Ajusta tu PURCHASE.`);
    }

    if (availableUSDT < purchaseAmountUsdt) {
        throw new Error(`Balance insuficiente para la primera orden. Necesario: ${purchaseAmountUsdt.toFixed(2)} USDT, Disponible: ${availableUSDT.toFixed(2)} USDT.`);
    }

    if (currentPrice === undefined || currentPrice === null || currentPrice === 0) {
        throw new Error(`Precio actual no disponible o es cero para la primera orden.`);
    }

    const orderResult = await placeOrder(authCredentials, symbol, side, type, purchaseAmountUsdt.toString());

    if (orderResult && orderResult.order_id) {
        const filledOrder = await getOrderDetail(authCredentials, symbol, orderResult.order_id);

        if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
            console.log(`[BITMART_SERVICE] Primera orden de compra (Market) completada: ${JSON.stringify(filledOrder)}`);
            return {
                orderId: filledOrder.order_id,
                price: parseFloat(filledOrder.price || 0),
                size: parseFloat(filledOrder.filled_size || 0),
                side: 'buy',
                type: 'market',
                state: 'filled'
            };
        } else {
            throw new Error(`La primera orden ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
        }
    } else {
        throw new Error(`Error al colocar la primera orden: No se recibió order_id o la respuesta es inválida.`);
    }
}

async function placeCoverageBuyOrder(authCredentials, symbol, nextUSDTAmount, targetPrice) {
    console.log(`[BITMART_SERVICE] Colocando orden de compra de COBERTURA (Limit)...`);
    const side = 'buy';
    const type = 'limit';

    const balanceInfo = await getBalance(authCredentials);
    const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available || 0) : 0;

    if (availableUSDT < nextUSDTAmount || nextUSDTAmount < MIN_USDT_VALUE_FOR_BITMART) {
        throw new Error(`Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto de orden (${nextUSDTAmount.toFixed(2)} USDT) es menor al mínimo para orden de cobertura.`);
    }

    if (targetPrice === undefined || targetPrice === null || targetPrice === 0) {
        throw new Error(`Precio objetivo de cobertura no disponible o es cero.`);
    }

    const orderResult = await placeOrder(authCredentials, symbol, side, type, nextUSDTAmount.toFixed(2), targetPrice.toFixed(2));

    if (orderResult && orderResult.order_id) {
        const filledOrder = await getOrderDetail(authCredentials, symbol, orderResult.order_id);

        if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
            console.log(`[BITMART_SERVICE] Orden de cobertura (Limit) completada: ${JSON.stringify(filledOrder)}`);
            return {
                orderId: filledOrder.order_id,
                price: parseFloat(filledOrder.price || 0),
                size: parseFloat(filledOrder.filled_size || 0),
                side: 'buy',
                type: 'limit',
                state: 'filled'
            };
        } else if (filledOrder && (filledOrder.state === 'open' || filledOrder.state === 'partial_filled')) {
            console.log(`[BITMART_SERVICE] Orden de cobertura (Limit) ${orderResult.order_id} está ${filledOrder.state}.`);
            return {
                orderId: filledOrder.order_id,
                price: parseFloat(filledOrder.price || 0),
                size: parseFloat(filledOrder.size || 0),
                filledSize: parseFloat(filledOrder.filled_size || 0),
                side: 'buy',
                type: 'limit',
                state: filledOrder.state
            };
        } else {
            throw new Error(`La orden de cobertura ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
        }
    } else {
        throw new Error(`Error al colocar orden de cobertura: No se recibió order_id o la respuesta es inválida.`);
    }
}

async function placeSellOrder(authCredentials, symbol, sizeBTC, price = null) {
    console.log(`[BITMART_SERVICE] Colocando orden de VENTA ${price ? '(Limit)' : '(Market)'}...`);
    const side = 'sell';
    const type = price ? 'limit' : 'market';

    if (sizeBTC <= 0) {
        throw new Error(`No hay activo para vender (AC = 0).`);
    }

    const orderResult = await placeOrder(authCredentials, symbol, side, type, sizeBTC.toFixed(8), price ? price.toFixed(2) : undefined);

    if (orderResult && orderResult.order_id) {
        const filledOrder = await getOrderDetail(authCredentials, symbol, orderResult.order_id);

        if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
            console.log(`[BITMART_SERVICE] Orden de venta ${type} completada: ${JSON.stringify(filledOrder)}`);
            return {
                orderId: filledOrder.order_id,
                price: parseFloat(filledOrder.price || 0),
                size: parseFloat(filledOrder.filled_size || 0),
                side: 'sell',
                type: type,
                state: 'filled'
            };
        } else if (filledOrder && (filledOrder.state === 'open' || filledOrder.state === 'partial_filled')) {
            console.log(`[BITMART_SERVICE] Orden de venta ${orderResult.order_id} está ${filledOrder.state}.`);
            return {
                orderId: filledOrder.order_id,
                price: parseFloat(filledOrder.price || 0),
                size: parseFloat(filledOrder.size || 0),
                filledSize: parseFloat(filledOrder.filled_size || 0),
                side: 'sell',
                type: type,
                state: filledOrder.state
            };
        } else {
            throw new Error(`La orden de venta ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
        }
    } else {
        throw new Error(`Error al colocar la orden de venta: No se recibió order_id o la respuesta es inválida.`);
    }
}

async function placeLimitSellOrder(authCredentials, symbol, sizeBTC, price) {
    console.log(`[BITMART_SERVICE] Colocando orden de VENTA LÍMITE...`);
    return await placeSellOrder(authCredentials, symbol, sizeBTC, price);
}

module.exports = {
    getTicker,
    getBalance,
    getAccountBalances: getBalance,
    getOpenOrders,
    getOrderDetail,
    placeOrder,
    cancelOrder,
    getHistoryOrdersV4,
    getKlines,
    validateApiKeys,
    getSystemTime,
    cancelAllOpenOrders,
    placeFirstBuyOrder,
    placeCoverageBuyOrder,
    placeSellOrder,
    placeLimitSellOrder,
};