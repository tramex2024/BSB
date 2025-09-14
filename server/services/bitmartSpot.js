const { makeRequest } = require('./bitmartClient');

const LOG_PREFIX = '[BITMART_SPOT_SERVICE]';
const MIN_USDT_VALUE_FOR_BITMART = 5;

// Constantes para los reintentos
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 500;

const orderStatusMap = {
    'filled': 1,
    'cancelled': 6,
    'all': 0
};

/**
 * Obtiene la hora del sistema.
 * @returns {Promise<number>} - Tiempo del servidor en milisegundos.
 */
async function getSystemTime() {
    const response = await makeRequest('GET', '/system/time');
    return response.data.server_time;
}

/**
 * Obtiene el ticker para un símbolo específico.
 * @param {string} symbol - Símbolo de trading (e.g., 'BTC_USDT').
 * @returns {Promise<object>} - Datos del ticker.
 */
async function getTicker(symbol) {
    const endpoint = `/spot/v1/ticker`;
    const response = await makeRequest('GET', endpoint, { symbol });
    return response.data.tickers.find(t => t.symbol === symbol);
}

/**
 * Obtiene los balances de la billetera spot.
 * Utiliza el endpoint v1, ya que el v4 ha demostrado ser problemático en nuestras pruebas.
 * @returns {Promise<object[]>} - Un arreglo de objetos de balance.
 */
async function getBalance() {
    try {
        const response = await makeRequest('GET', '/account/v1/wallet');
        return response.data.wallet;
    } catch (error) {
        throw new Error(`Error al obtener los balances: ${error.message}`);
    }
}

/**
 * Obtiene las órdenes abiertas para un símbolo específico.
 * @param {string} symbol - Símbolo de trading (e.g., 'BTC_USDT').
 * @returns {Promise<object>} - Un objeto con la lista de órdenes abiertas.
 */
async function getOpenOrders(symbol) {
    if (!symbol || typeof symbol !== 'string') {
        throw new Error(`${LOG_PREFIX} 'symbol' es un parámetro requerido y debe ser una cadena de texto.`);
    }

    const endpoint = '/spot/v4/query/open-orders';
    const requestBody = {
    symbol,
    limit: 100 // Esto asegura que se soliciten hasta 100 órdenes abiertas.
};
    try {
        const response = await makeRequest('POST', endpoint, {}, requestBody);
        let orders = [];

// Si la respuesta viene con la estructura { data: [...] }
if (response.data && Array.isArray(response.data.data)) {
    orders = response.data.data;
}
// Si la respuesta es un arreglo directamente
else if (response.data && Array.isArray(response.data)) {
    orders = response.data;
}
        return { orders };
    } catch (error) {
        console.error(`${LOG_PREFIX} Error al obtener órdenes abiertas:`, error.message);
        throw error;
    }
}

/**
 * Obtiene el historial de órdenes para un símbolo y estado.
 * @param {object} options - Opciones de la consulta.
 * @returns {Promise<object[]>} - Un arreglo de objetos con el historial de órdenes.
 */
async function getHistoryOrders(options = {}) {
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
        const response = await makeRequest('POST', endpoint, {}, requestBody);
        
        // VERIFICACIÓN: Muestra la respuesta completa para depuración
        console.log(`${LOG_PREFIX} Respuesta cruda de BitMart para el historial de órdenes:`, JSON.stringify(response.data, null, 2));
        
        let orders = [];
        
        // CORRECCIÓN: Verifica si la respuesta es un arreglo directamente
        if (response.data && Array.isArray(response.data)) {
            orders = response.data;
        } 
        // Si no, verifica si el arreglo está dentro de una propiedad 'list'
        else if (response.data && response.data.data && Array.isArray(response.data.data.list)) {
            orders = response.data.data.list;
        }
        
        return orders;
    } catch (error) {
        console.error(`${LOG_PREFIX} Error al obtener el historial de órdenes:`, error.message);
        throw error;
    }
}

/**
 * Obtiene los detalles de una orden específica con reintentos.
 * @param {string} symbol - Símbolo de trading.
 * @param {string} orderId - ID de la orden.
 * @param {number} [retries=0] - Número de reintentos.
 * @param {number} [delay=INITIAL_RETRY_DELAY_MS] - Retraso inicial entre reintentos.
 * @returns {Promise<object>} - Detalles de la orden.
 */
async function getOrderDetail(symbol, orderId, retries = 0, delay = INITIAL_RETRY_DELAY_MS) {
    if (!symbol || typeof symbol !== 'string' || !orderId || typeof orderId !== 'string') {
        throw new Error(`${LOG_PREFIX} 'symbol' y 'orderId' son parámetros requeridos y deben ser cadenas de texto.`);
    }
    const requestBody = { symbol, order_id: orderId };
    if (retries >= MAX_RETRIES) {
        throw new Error(`Fallaron ${MAX_RETRIES} reintentos al obtener detalles de la orden ${orderId}.`);
    }
    try {
        const response = await makeRequest('POST', '/spot/v4/query/order-detail', {}, requestBody);
        const order = response.data.data;
        return order;
    } catch (error) {
        if (error.isRetryable && retries < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return getOrderDetail(symbol, orderId, retries + 1, delay * 1.5);
        } else {
            throw error;
        }
    }
}

/**
 * Coloca una nueva orden.
 * @param {string} symbol - Símbolo de trading.
 * @param {string} side - 'buy' o 'sell'.
 * @param {string} type - 'limit' o 'market'.
 * @param {string} size - Cantidad de la orden.
 * @param {string} [price] - Precio para órdenes limit.
 * @returns {Promise<object>} - Respuesta de la API.
 */
async function placeOrder(symbol, side, type, size, price) {
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
    const response = await makeRequest('POST', '/spot/v2/submit_order', {}, requestBody);
    const orderId = response.data.order_id;
    if (!orderId) throw new Error('Error al colocar la orden: No se recibió un order_id.');
    return response.data;
}

/**
 * Cancela una orden.
 * @param {string} symbol - Símbolo de trading.
 * @param {string} order_id - ID de la orden.
 * @returns {Promise<object>} - Respuesta de la API.
 */
async function cancelOrder(symbol, order_id) {
    const requestBody = { symbol, order_id };
    const response = await makeRequest('POST', '/spot/v2/cancel-order', {}, requestBody);
    return response.data;
}

/**
 * Obtiene los datos de velas (klines).
 * @param {string} symbol - Símbolo de trading.
 * @param {string} interval - Intervalo de tiempo.
 * @param {number} limit - Número de velas a obtener.
 * @returns {Promise<object[]>} - Arreglo de datos de velas.
 */
async function getKlines(symbol, interval, limit = 200) {
    const path = `/spot/quotation/v3/klines`;
    const params = { symbol, step: interval, size: limit };
    const response = await makeRequest('GET', path, params);
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