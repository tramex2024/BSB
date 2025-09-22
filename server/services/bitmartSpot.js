// Archivo: BSB/server/services/bitmartSpot.js
const { makeRequest } = require('./bitmartClient');

const LOG_PREFIX = '[BITMART_SPOT_SERVICE]';
const MIN_USDT_VALUE_FOR_BITMART = 5;

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 500;

const orderStatusMap = {
    'filled': 1,
    'cancelled': 6,
    'all': 0
};

async function getSystemTime(creds) {
    const response = await makeRequest(creds, 'GET', '/system/time');
    return response.data.server_time;
}

async function getTicker(creds, symbol) {
    const endpoint = `/spot/v1/ticker`;
    const response = await makeRequest(creds, 'GET', endpoint, { symbol });
    return response.data.tickers.find(t => t.symbol === symbol);
}

async function getBalance(creds) {
    try {
        const response = await makeRequest(creds, 'GET', '/account/v1/wallet');
        return response.data.wallet;
    } catch (error) {
        throw new Error(`Error al obtener los balances: ${error.message}`);
    }
}

async function getOpenOrders(creds, symbol) {
    if (!symbol || typeof symbol !== 'string') {
        throw new Error(`${LOG_PREFIX} 'symbol' es un parámetro requerido y debe ser una cadena de texto.`);
    }

    const endpoint = '/spot/v4/query/open-orders';
    const requestBody = {
        symbol,
        limit: 100
    };
    try {
        const response = await makeRequest(creds, 'POST', endpoint, {}, requestBody);
        let orders = [];

        if (response.data && Array.isArray(response.data.data)) {
            orders = response.data.data;
        } else if (response.data && Array.isArray(response.data)) {
            orders = response.data;
        }
        return { orders };
    } catch (error) {
        console.error(`${LOG_PREFIX} Error al obtener órdenes abiertas:`, error.message);
        throw error;
    }
}

async function getHistoryOrders(creds, options = {}) {
    if (!options.symbol || typeof options.symbol !== 'string') {
        throw new Error(`${LOG_PREFIX} 'options.symbol' es un parámetro requerido y debe ser una cadena de texto.`);
    }

    const endpoint = '/spot/v4/query/history-orders';
    const requestBody = {
        symbol: options.symbol,
        orderMode: 'spot',
        startTime: options.startTime,
        endTime: options.endTime,
        limit: options.limit
    };

    if (options.status && options.status !== 'all') {
        const statusCode = orderStatusMap[options.status];
        if (statusCode !== undefined) {
            requestBody.status = statusCode;
        } else {
            console.warn(`${LOG_PREFIX} Estado de orden no reconocido: ${options.status}`);
        }
    }
    
    try {
        const response = await makeRequest(creds, 'POST', endpoint, {}, requestBody);
        
        let orders = [];
        
        if (response.data && Array.isArray(response.data)) {
            orders = response.data;
        } else if (response.data && response.data.data && Array.isArray(response.data.data.list)) {
            orders = response.data.data.list;
        }
        
        return orders;
    } catch (error) {
        console.error(`${LOG_PREFIX} Error al obtener el historial de órdenes:`, error.message);
        throw error;
    }
}

async function getOrderDetail(creds, symbol, orderId, retries = 0, delay = INITIAL_RETRY_DELAY_MS) {
    if (!symbol || typeof symbol !== 'string' || !orderId || typeof orderId !== 'string') {
        throw new Error(`${LOG_PREFIX} 'symbol' y 'orderId' son parámetros requeridos y deben ser cadenas de texto.`);
    }
    const requestBody = { symbol, order_id: orderId };
    if (retries >= MAX_RETRIES) {
        throw new Error(`Fallaron ${MAX_RETRIES} reintentos al obtener detalles de la orden ${orderId}.`);
    }
    try {
        const response = await makeRequest(creds, 'POST', '/spot/v4/query/order-detail', {}, requestBody);
        const order = response.data.data;
        return order;
    } catch (error) {
        if (error.isRetryable && retries < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return getOrderDetail(creds, symbol, orderId, retries + 1, delay * 1.5);
        } else {
            throw error;
        }
    }
}

async function placeOrder(creds, symbol, side, type, size, price) {
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
    const response = await makeRequest(creds, 'POST', '/spot/v2/submit_order', {}, requestBody);
    const orderId = response.data.order_id;
    if (!orderId) throw new Error('Error al colocar la orden: No se recibió un order_id.');
    return response.data;
}

async function cancelOrder(creds, symbol, order_id) {
    const requestBody = { symbol, order_id };
    const response = await makeRequest(creds, 'POST', '/spot/v2/cancel-order', {}, requestBody);
    return response.data;
}

async function getKlines(creds, symbol, interval, limit = 200) {
    const path = `/spot/quotation/v3/klines`;
    const params = { symbol, step: interval, size: limit };
    const response = await makeRequest(creds, 'GET', path, params);
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