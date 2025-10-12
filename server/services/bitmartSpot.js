// Archivo: BSB/server/services/bitmartSpot.js

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
        
        // Muestra la respuesta completa para depuración (Útil para confirmar nuevos formatos)
//        console.log(`${LOG_PREFIX} Respuesta cruda de BitMart para el historial de órdenes:`, JSON.stringify(response.data, null, 2)); 
        
        let rawOrders = [];
        
        // CORRECCIÓN: Manejo de la estructura de respuesta de BitMart
        if (response.data && Array.isArray(response.data)) {
            rawOrders = response.data;
        } 
        else if (response.data && response.data.data && Array.isArray(response.data.data.list)) {
            rawOrders = response.data.data.list;
        }

        // 🛠️ NORMALIZACIÓN DE DATOS: Asegura que price y size muestren los valores de ejecución
        const normalizedOrders = rawOrders.map(order => {
            
            // Si la orden se llenó (filledSize > 0 o priceAvg > 0), usamos los datos de ejecución real.
            // Esto corrige el problema de órdenes de mercado que tienen 'price' y 'size' como '0.00'.
            const finalPrice = parseFloat(order.priceAvg) > 0 ? order.priceAvg : order.price;
            const finalSize = parseFloat(order.filledSize) > 0 ? order.filledSize : order.size;

            return {
                ...order, // Mantiene todos los campos originales
                // Sobrescribe los campos clave con los valores reales para el frontend
                price: finalPrice, 
                size: finalSize,   
            };
        });
        
        return normalizedOrders;
    } catch (error) {
        console.error(`${LOG_PREFIX} Error al obtener el historial de órdenes:`, error.message);
        throw error;
    }
}

/**
 * Obtiene los detalles de una orden específica con reintentos.
 * @param {object} creds - Credenciales de la API (AÑADIDO).
 * @param {string} symbol - Símbolo de trading.
 * @param {string} orderId - ID de la orden.
 * @param {number} [retries=0] - Número de reintentos.
 * @param {number} [delay=INITIAL_RETRY_DELAY_MS] - Retraso inicial entre reintentos.
 * @returns {Promise<object>} - Detalles de la orden.
 */
async function getOrderDetail(creds, symbol, orderId, retries = 0, delay = INITIAL_RETRY_DELAY_MS) {
    // 💡 IMPORTANTE: Si la capa makeRequest usa el objeto 'creds' para la firma, debe ser pasado.
    
    // NOTA: La validación de 'symbol' y 'orderId' ahora será manejada por bitmartService.js, 
    // pero la dejamos aquí como doble-seguridad.
    if (!symbol || typeof symbol !== 'string' || !orderId || typeof orderId !== 'string') {
        throw new Error(`${LOG_PREFIX} 'symbol' y 'orderId' son parámetros requeridos y deben ser cadenas de texto.`);
    }
    const requestBody = { symbol, order_id: orderId };
    if (retries >= MAX_RETRIES) {
        throw new Error(`Fallaron ${MAX_RETRIES} reintentos al obtener detalles de la orden ${orderId}.`);
    }
    try {
        // 💡 CORRECCIÓN CRÍTICA: Pasamos 'creds' en el makeRequest (asumiendo que es el tercer argumento de makeRequest)
        const response = await makeRequest('POST', '/spot/v4/query/order-detail', creds, requestBody); 
        const order = response.data.data;
        return order;
    } catch (error) {
        if (error.isRetryable && retries < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return getOrderDetail(creds, symbol, orderId, retries + 1, delay * 1.5); // Llamada recursiva corregida
        } else {
            // Re-lanzar un error más descriptivo
            throw new Error(`Falló la solicitud a BitMart en /spot/v4/query/order-detail: ${error.message}`);
        }
    }
}

/**
 * Coloca una nueva orden.
 * @param {object} [creds] - Credenciales de la API (Añadido para igualar la firma de bitmartService).
 * @param {string} symbol - Símbolo de trading.
 * @param {string} side - 'buy' o 'sell'.
 * @param {string} type - 'limit' o 'market'.
 * @param {string} size - Cantidad de la orden.
 * @param {string} [price] - Precio para órdenes limit.
 * @returns {Promise<object>} - Respuesta de la API.
 */
// ⬇️ CORRECCIÓN DE LA FIRMA: Debe recibir 'creds' y manejar la estandarización.
async function placeOrder(creds, symbol, side, type, size, price) {
    const standardizedSide = side.toLowerCase(); // Estandarizar side a minúsculas
    const requestBody = { symbol, side: standardizedSide, type };

    if (type === 'limit') {
        if (!price) throw new Error("El precio es requerido para órdenes 'limit'.");
        Object.assign(requestBody, { size: size.toString(), price: price.toString() });
    } else if (type === 'market') {
        // Usar standardizedSide para la lógica de notional/size
        if (standardizedSide === 'buy') Object.assign(requestBody, { notional: size.toString() });
        else if (standardizedSide === 'sell') Object.assign(requestBody, { size: size.toString() });
        else throw new Error(`Tipo de orden no soportado para side: ${standardizedSide} y type: ${type}`);
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