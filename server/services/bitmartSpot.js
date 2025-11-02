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

      // 🛠️ NORMALIZACIÓN DE DATOS CRÍTICA: Añade campos necesarios para la lógica del BOT
        const normalizedOrders = rawOrders.map(order => {
            
            // 1. Preprocesamiento de valores de ejecución
            const finalPrice = parseFloat(order.priceAvg) > 0 ? order.priceAvg : order.price;
            const finalSize = parseFloat(order.filledSize) > 0 ? order.filledSize : order.size;

            // 2. Mapeo de estado a formato de texto para LBuying.js
            let statusName = order.state || 'new'; 
            if (order.status === 1 || order.state === 'filled') statusName = 'filled';
            else if (order.status === 6 || order.state === 'partially_canceled') statusName = 'partially_canceled';
            else if (order.status === 2 || order.state === 'canceled') statusName = 'canceled';
            else statusName = order.state || 'new'; // Mantener el estado si no se reconoce
            
            // 3. Obtener el valor llenado (el historial a veces usa filledSize o executed_volume)
            const volumeLlenado = parseFloat(order.filledSize || order.executed_volume || 0);

            return {
                ...order, // Mantiene todos los campos originales

                // 🚨 CAMPOS CRÍTICOS A EXPLICITAR:
                order_id: String(order.orderId), // El ID en minúsculas para coincidir con el BotState
                state: statusName,
                filledVolume: volumeLlenado, // ¡ESTE CAMPO AHORA ESTÁ GARANTIZADO!

                // Sobrescribe campos con valores de ejecución
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
 * Obtiene los detalles de una orden específica (activa o reciente).
 * Intenta consultar primero ÓRDENES ABIERTAS, y luego ÓRDENES RECIENTES (Historial).
 * @param {string} symbol - Símbolo de trading.
 * @param {string} orderId - ID de la orden.
 * @returns {Promise<object | null>} - Detalles de la orden, o null si no se encuentra.
 */
async function getOrderDetail(symbol, orderId) {
    const endpoint = '/spot/v4/query/order'; // ⬅️ Endpoint Específico de BitMart (API v4)

    // 🛑 CRÍTICO: Asegurarse de que el orderId sea una CADENA DE TEXTO para evitar pérdida de precisión
    const orderIdString = String(orderId);

    const requestBody = { 
        symbol: symbol, 
        orderId: orderIdString, // ⬅️ ¡Incluimos el ID en la solicitud!
        orderMode: 'spot' 
    };
    
    try {
        // Consultar el detalle de la orden directamente por ID
        const response = await makeRequest('POST', endpoint, {}, requestBody);
        
        // La respuesta de este endpoint debe devolver directamente el objeto de la orden.
        // Asumiendo que response.data es el objeto de la orden si es exitoso.
        if (response.data && response.data.data) {
             const orderDetails = response.data.data;

             if (orderDetails.orderId === orderIdString) {
                console.log(`[LOG]: Detalle de orden ${orderIdString} encontrado. Estado: ${orderDetails.state}`);
                return orderDetails; // Devuelve los detalles de la orden
             }
        }
        
        console.log(`[LOG]: Orden ${orderIdString} no encontrada a través de la consulta directa por ID.`);
        return null;

    } catch (error) {
        // Capturar y manejar el Bad Request
        console.error(`[LOG - ERROR]: Falló la consulta de detalle (vía Direct Query) para ${orderIdString}: ${error.message}`);
        
        // Si el error indica que la orden no existe (código de BitMart), devolvemos null.
        // De lo contrario, relanzamos el error si se trata de un problema de firma/conexión.
        // Si no tienes el código de error específico de BitMart para 'Order Not Found', es mejor devolver null y dejar que el bot reintente.
        if (error.message.includes('Bad Request')) {
            console.warn(`[LOG - WARNING]: Error 400 durante getOrderDetail, asumiendo que la orden no es consultable/existente.`);
            return null;
        }

        // Si fue un error diferente al Bad Request, relanzamos
        throw error;
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