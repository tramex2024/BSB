// BSB/server/services/bitmartSpot.js

const axios = require('axios');
const CryptoJS = require('crypto-js');
const { makeRequest } = require('./bitmartClient');
const BASE_URL = 'https://api-cloud.bitmart.com';
const LOG_PREFIX = '[BITMART_SPOT_SERVICE]';
const MIN_USDT_VALUE_FOR_BITMART = 5;

const orderStatusMap = {
    'filled': 1,
    'cancelled': 6,
    'all': 0 // O simplemente no se usa el parámetro de status
};

// Constantes para los reintentos
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 500;

async function getSystemTime() {
    const response = await makeRequest(null, 'GET', '/system/time');
    return response.data.server_time;
}

async function getTicker(symbol) {
    const endpoint = `/spot/v1/ticker`;
    const response = await makeRequest(null, 'GET', endpoint, { symbol });
    return response.data.tickers.find(t => t.symbol === symbol);
}

async function getBalance(authCredentials) {
    const response = await makeRequest(authCredentials, 'GET', '/account/v1/wallet');
    const balances = response.data.wallet;
    return balances;
}

function generateSign(timestamp, body, credentials) {
    const message = timestamp + '#' + credentials.memo + '#' + body;
    return CryptoJS.HmacSHA256(message, credentials.secretKey).toString(CryptoJS.enc.Hex);
}

async function getBalance(authCredentials) {
    // Usamos el endpoint v4 para mayor compatibilidad
    const endpoint = '/spot/v4/wallet';
    const response = await makeRequest(authCredentials, 'GET', endpoint);
    const balances = response.data.wallet;
    return balances;
}

async function getOpenOrders(authCredentials, symbol) {
    const endpoint = '/spot/v4/query/open-orders';
    const requestBody = { symbol };
    try {
        // Usamos POST como tu código original, ya que la solicitud GET falló con 404
        const response = await makeRequest(authCredentials, 'POST', endpoint, requestBody);
        const orders = response.data && Array.isArray(response.data.data) ? response.data.data : (response.data && Array.isArray(response.data) ? response.data : []);
        return { orders };
    } catch (error) {
        console.error('Error al obtener órdenes abiertas:', error.message);
        throw error;
    }
}

async function getHistoryOrders(authCredentials, options = {}) {
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
            console.warn(`[getHistoryOrders] Estado de orden no reconocido: ${options.status}`);
        }
    }
    
    try {
        // Usamos POST como tu código original, ya que las peticiones GET fallaron
        const response = await makeRequest(authCredentials, 'POST', endpoint, requestBody);
        
        const orders = response.data && response.data.data && Array.isArray(response.data.data.list)
            ? response.data.data.list
            : [];
            
        return orders;
    } catch (error) {
        console.error('Error al obtener el historial de órdenes:', error.message);
        throw error;
    }
}

async function getOrderDetail(authCredentials, symbol, orderId, retries = 0, delay = INITIAL_RETRY_DELAY_MS) {
    const requestBody = { symbol, order_id: orderId };
    if (retries >= MAX_RETRIES) {
        throw new Error(`Fallaron ${MAX_RETRIES} reintentos al obtener detalles de la orden ${orderId}.`);
    }
    try {
        const response = await makeRequest(authCredentials, 'POST', '/spot/v4/query/order-detail', {}, requestBody);
        const order = response.data.data;
        return order;
    } catch (error) {
        if (error.isRetryable && retries < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return getOrderDetail(authCredentials, symbol, orderId, retries + 1, delay * 1.5);
        } else {
            throw error;
        }
    }
}

async function placeOrder(authCredentials, symbol, side, type, size, price) {
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
    return response.data;
}

async function cancelOrder(authCredentials, symbol, order_id) {
    const requestBody = { symbol, order_id };
    const response = await makeRequest(authCredentials, 'POST', '/spot/v2/cancel-order', {}, requestBody);
    return response.data;
}

async function getKlines(symbol, interval, limit = 200) {
    const path = `/spot/quotation/v3/klines`;
    const params = { symbol, step: interval, size: limit };
    const response = await makeRequest(null, 'GET', path, params);
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