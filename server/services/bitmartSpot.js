// BSB/server/services/bitmartSpot.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const { makeRequest } = require('./bitmartClient');

const BASE_URL = 'https://api-cloud.bitmart.com';

const LOG_PREFIX = '[BITMART_SPOT_SERVICE]';
const MIN_USDT_VALUE_FOR_BITMART = 5;

// Constantes para los reintentos
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 500;

async function getSystemTime() {
    console.log(`${LOG_PREFIX} Obteniendo hora del sistema...`);
    const response = await makeRequest(null, 'GET', '/system/time');
    return response.data.server_time;
}

async function getTicker(symbol) {
    console.log(`${LOG_PREFIX} Obteniendo Ticker para ${symbol}...`);
    const endpoint = `/spot/v1/ticker`;
    const response = await makeRequest(null, 'GET', endpoint, { symbol });
    return response.data.tickers.find(t => t.symbol === symbol);
}

async function getBalance(authCredentials) {
    console.log(`${LOG_PREFIX} Obteniendo balance de la cuenta...`);
    const response = await makeRequest(authCredentials, 'GET', '/account/v1/wallet');
    const balances = response.data.wallet;
    console.log('✅ Balance de la cuenta obtenido con éxito.');
    balances.forEach(b => console.log(`   - ${b.currency}: Disponible ${b.available}, Congelado ${b.frozen}`));
    return balances;
}

//function generateSign(timestamp, body, credentials) {
//    const message = timestamp + '#' + credentials.memo + '#' + body;
//    return CryptoJS.HmacSHA256(message, credentials.secretKey).toString(CryptoJS.enc.Hex);
//}

async function getHistoryOrders(authCredentials, options = {}) {
    console.log(`\n--- Paso Final 4: Listando Historial de Órdenes (V4 POST) ---`);
    const timestamp = Date.now().toString();
    const path = '/spot/v4/query/history-orders';
    const requestBody = { recvWindow: 5000 };

    if (options.symbol) { requestBody.symbol = options.symbol; }
    if (options.orderMode) { requestBody.orderMode = options.orderMode; }
    if (options.startTime) { requestBody.startTime = options.startTime; }
    if (options.endTime) { requestBody.endTime = options.endTime; }
    if (options.limit) { requestBody.limit = options.limit; }

    const bodyForSign = JSON.stringify(requestBody);
    
    // Aquí es donde cambiamos la forma en que se llama a la firma
    const sign = generateSign(timestamp, bodyForSign, authCredentials);
    
    const url = `${BASE_URL}${path}`;
    const headers = {
        'Content-Type': 'application/json',
        'X-BM-KEY': authCredentials.apiKey,
        'X-BM-TIMESTAMP': timestamp,
        'X-BM-SIGN': sign,
    };
    try {
        const response = await axios.post(url, requestBody, { headers });
        if (response.data.code === 1000) {
            const orders = Array.isArray(response.data.data) ? response.data.data : (response.data.data && Array.isArray(response.data.data.list) ? response.data.data.list : []);
            if (orders.length > 0) {
                console.log(`✅ ¡Historial de órdenes obtenido! Se encontraron ${orders.length} órdenes.`);
                orders.slice(0, 5).forEach((order, index) => console.log(`\n--- Orden Histórica ${index + 1} ---`, JSON.stringify(order, null, 2)));
                if (orders.length > 5) console.log(`...y ${orders.length - 5} órdenes más.`);
            } else {
                console.log('ℹ️ No se encontraron órdenes en el historial.');
            }
            return orders;
        } else {
            throw new Error(`Error de BitMart API: ${response.data.message} (Code: ${response.data.code})`);
        }
    } catch (error) {
        console.error('\n❌ Falló la obtención del historial de órdenes spot V4.');
        console.error('Error:', error.response ? error.response.data : error.message);
        throw error;
    }
}

//async function getHistoryOrders(authCredentials, options = {}) {
//    console.log(`${LOG_PREFIX} Listando historial de órdenes (V4 POST)...`);
//    const path = '/spot/v4/query/history-orders';
//    const requestBody = { ...options };
//    try {
//        const response = await makeRequest(authCredentials, 'POST', path, {}, requestBody, true);
//        let orders = [];
//        if (Array.isArray(response.data.data)) {
//            orders = response.data.data;
//        } else if (response.data.data && Array.isArray(response.data.data.list)) {
//            orders = response.data.data.list;
//        }
//        if (orders.length > 0) {
//            console.log(`✅ Historial de Órdenes obtenido. Se encontraron ${orders.length} órdenes.`);
//        } else {
//            console.log('ℹ️ No se encontraron órdenes en el historial.');
//        }
//        return orders;
//    } catch (error) {
//        console.error('\n❌ Falló la obtención del historial de órdenes V4.');
//        console.error('Error:', error.response ? error.response.data : error.message);
//        throw error;
//    }
//}

async function getOpenOrders(authCredentials, symbol) {
    console.log(`${LOG_PREFIX} Obteniendo órdenes abiertas para ${symbol}...`);
    const endpoint = '/spot/v4/query/open-orders';
    const requestBody = { symbol };

    try {
        const response = await makeRequest(authCredentials, 'POST', endpoint, {}, requestBody, true);
        const orders = response.data && Array.isArray(response.data.data) ? response.data.data : (response.data && Array.isArray(response.data) ? response.data : []);

        if (orders.length > 0) {
            console.log(`✅ ¡Órdenes Abiertas obtenidas! Se encontraron ${orders.length} órdenes.`);
            return { orders };
        } else {
            console.log('ℹ️ No se encontraron órdenes abiertas.');
            return { orders: [] };
        }

    } catch (error) {
        console.error('\n❌ Falló la obtención de órdenes abiertas.');
        if (error.response) {
            console.error('Error Data:', error.response.data);
        }
        throw error;
    }
}

async function getOrderDetail(authCredentials, symbol, orderId, retries = 0, delay = INITIAL_RETRY_DELAY_MS) {
    console.log(`${LOG_PREFIX} Obteniendo detalle de orden ${orderId} para ${symbol} (V4 POST)...`);
    const requestBody = { symbol, order_id: orderId };
    if (retries >= MAX_RETRIES) {
        throw new Error(`Fallaron ${MAX_RETRIES} reintentos al obtener detalles de la orden ${orderId}.`);
    }
    try {
        const response = await makeRequest(authCredentials, 'POST', '/spot/v4/query/order-detail', {}, requestBody);
        const order = response.data.data;
        console.log(`✅ Detalle de orden ${orderId} obtenido con éxito:`);
        console.log(`   - Order ID: ${order.order_id}, Símbolo: ${order.symbol}, Lado: ${order.side}, Tipo: ${order.type}, Estado: ${order.state}`);
        return order;
    } catch (error) {
        if (error.isRetryable && retries < MAX_RETRIES) {
            console.warn(`[RETRY] Orden ${orderId} no encontrada aún. Reintento ${retries + 1}/${MAX_RETRIES} en ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return getOrderDetail(authCredentials, symbol, orderId, retries + 1, delay * 1.5);
        } else {
            console.error(`\n❌ Error al obtener el detalle de la orden ${orderId}:`, error.message);
            throw error;
        }
    }
}

async function placeOrder(authCredentials, symbol, side, type, size, price) {
    console.log(`${LOG_PREFIX} Colocando orden de ${side.toUpperCase()} de ${size} ${symbol} (${type})...`);
    const requestBody = { symbol, side, type };
    if (type === 'limit') {
        if (!price) throw new Error("El precio es requerido para órdenes 'limit'.");
        Object.assign(requestBody, { size: size.toString(), price: price.toString() });
    } else if (type === 'market') {
        if (side === 'buy') Object.assign(requestBody, { notional: size.toString() });
        else if (side === 'sell') Object.assign(requestBody, { size: size.toString() });
        else throw new Error(`Tipo de orden no soportado para side: ${side} y type: ${type}`);
    } else {
        throw new Error(`Tipo de orden no soportado: ${type}`);
    }
    const response = await makeRequest(authCredentials, 'POST', '/spot/v2/submit_order', {}, requestBody);
    const orderId = response.data.order_id;
    if (!orderId) throw new Error('Error al colocar la orden: No se recibió un order_id.');
    console.log(`✅ Orden colocada con éxito. ID: ${orderId}`);
    return response.data;
}

async function cancelOrder(authCredentials, symbol, order_id) {
    console.log(`${LOG_PREFIX} Cancelando orden ${order_id} para ${symbol}...`);
    const requestBody = { symbol, order_id };
    const response = await makeRequest(authCredentials, 'POST', '/spot/v2/cancel-order', {}, requestBody);
    console.log(`✅ Orden ${order_id} cancelada con éxito.`);
    return response.data;
}

async function getKlines(symbol, interval, limit = 200) {
    console.log(`${LOG_PREFIX} Solicitando Klines para ${symbol}, intervalo ${interval}, ${limit} velas...`);
    const path = `/spot/quotation/v3/klines`;
    const params = { symbol, step: interval, size: limit };
    const response = await makeRequest(null, 'GET', path, params);
    console.log(`✅ Klines (Candlesticks) para ${symbol} obtenidos con éxito.`);
    return response.data.map(c => ({
        timestamp: parseInt(c[0]),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5])
    }));
}

module.exports = {
    getSystemTime,
    getTicker,
    getBalance,
    getOpenOrders,
    getOrderDetail,
    placeOrder,
    cancelOrder,
    getHistoryOrders,
    getKlines,
    MIN_USDT_VALUE_FOR_BITMART,
};