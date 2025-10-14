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
 * @param {string} symbol - Símbolo de trading.
 * @param {string} orderId - ID de la orden.
 * @param {number} [retries=0] - Número de reintentos.
 * @param {number} [delay=INITIAL_RETRY_DELAY_MS] - Retraso inicial entre reintentos.
 * @returns {Promise<object>} - Detalles de la orden.
 */
async function getOrderDetail(symbol, orderId) {
    // Nota: Esta función asume que tienes acceso a la función makeRequest
    // estable que probamos en bot.js, configurada para manejar firmas, headers,
    // y el agente HTTP/HTTPS.

    try {
        // 1. Usar el endpoint de Historial V4 POST, ya probado como estable (TEST 2)
        const endpoint = '/spot/v4/query/history-orders';
        
        // Configuramos la solicitud para obtener las órdenes recientes del símbolo
        const requestBody = { 
            symbol: symbol, 
            orderMode: 'spot', // Asumiendo que es una orden spot
            limit: 100         // Consultar las 100 órdenes más recientes
        };
        
        // Ejecutar la solicitud
        const response = await makeRequest('POST', endpoint, {}, requestBody);
        
        let allOrders = [];
        
        // 2. Leer la lista de órdenes (Corrección de formato de lectura del TEST 2)
        // La respuesta exitosa de makeRequest es { code: 1000, data: [ ... lista ... ] }
        if (response.data && Array.isArray(response.data)) {
            allOrders = response.data;
        } else {
            // Si la API devuelve éxito pero no lista, puede ser un problema de límite o historial vacío
            console.log(`[LOG]: La API de Historial no devolvió una lista de órdenes para ${symbol}.`);
            return null;
        }

        // 3. Buscar la orden específica en la lista (Lógica del TEST 3)
        const orderDetails = allOrders.find(o => o.orderId === orderId);

        if (orderDetails) {
            console.log(`[LOG]: Detalle de orden ${orderId} encontrado en el historial. Estado: ${orderDetails.state}`);
            // Retorna el objeto de la orden con todos sus detalles (state, priceAvg, filledSize, etc.)
            return orderDetails;
        } else {
            console.log(`[LOG]: Orden ${orderId} no encontrada en las ${allOrders.length} órdenes recientes de ${symbol}.`);
            return null;
        }

    } catch (error) {
        // Capturar cualquier fallo en la conexión o firma
        console.error(`[LOG - ERROR]: Falló la consulta de detalle (vía Historial) para ${orderId}: ${error.message}`);
        return null;
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
async function placeOrder(symbol, side, type, amount, price) {
    const standardizedSide = side.toLowerCase(); // Estandarizar side a minúsculas
    const requestBody = { symbol, side: standardizedSide, type };

    if (type === 'limit') {
        if (!price) throw new Error("El precio es requerido para órdenes 'limit'.");
        // size para Limit Order es la cantidad de la moneda base
        Object.assign(requestBody, { size: amount.toString(), price: price.toString() });
    } else if (type === 'market') {
        // Usar standardizedSide para la lógica de notional/size
        if (standardizedSide === 'buy') {
             // 🛑 Para BUY Market, BitMart usa 'notional' (USDT amount)
             Object.assign(requestBody, { notional: amount.toString() }); 
        } else if (standardizedSide === 'sell') {
            // Para SELL Market, BitMart usa 'size' (Base Coin amount)
            Object.assign(requestBody, { size: amount.toString() }); 
        } else {
            throw new Error(`Lado de orden no soportado: ${standardizedSide}`);
        }
    } else {
        // Esta línea ahora debería recibir 'market', 'limit', etc.
        throw new Error(`Tipo de orden no soportado: ${type}`);
    }
    
    // Endpoint V2 para enviar órdenes
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