// Archivo: BSB/server/services/bitmartService.js

const spotService = require('./bitmartSpot');

const LOG_PREFIX = '[BITMART_SERVICE]';

/**
 * Valida las credenciales de la API de BitMart.
 * @returns {Promise<boolean>} - Verdadero si las credenciales son válidas, falso en caso contrario.
 */
async function validateApiKeys() {
    try {
        console.log('\n--- Iniciando validación de credenciales API de BitMart ---');
        // Usamos getBalance de spotService para probar las credenciales
        await spotService.getBalance(); 
        console.log('✅ Credenciales API de BitMart validadas con éxito. CONECTADO.');
        return true;
    } catch (error) {
        console.error('❌ Falló la validación de credenciales API de BitMart:', error.message);
        return false;
    }
}

/**
 * Obtiene los balances de la billetera.
 * @returns {Promise<object[]>} - Un arreglo de objetos de balance.
 */
async function getBalance() {
    return await spotService.getBalance();
}

/**
 * Obtiene los saldos disponibles para trading (available) de USDT y BTC.
 * @returns {Promise<{availableUSDT: number, availableBTC: number}>} - Objeto con los balances disponibles.
 */
async function getAvailableTradingBalances() {
    try {
        const balancesArray = await spotService.getBalance();
        
        const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
        const btcBalance = balancesArray.find(b => b.currency === 'BTC');

        const availableUSDT = parseFloat(usdtBalance?.available || 0);
        const availableBTC = parseFloat(btcBalance?.available || 0);
        
        return { availableUSDT, availableBTC };
    } catch (error) {
        console.error(`${LOG_PREFIX} Error al obtener los balances de trading:`, error.message);
        // Devolvemos cero si falla para evitar asignar fondos irreales por error.
        return { availableUSDT: 0, availableBTC: 0 }; 
    }
}

/**
 * Obtiene las órdenes abiertas para un símbolo específico.
 * @param {string} symbol - Símbolo de trading (e.g., 'BTC_USDT').
 * @returns {Promise<object>} - Un objeto con la lista de órdenes abiertas.
 */
async function getOpenOrders(symbol) {
    return await spotService.getOpenOrders(symbol);
}

/**
 * Obtiene el historial de órdenes para un símbolo y estado.
 * @param {object} options - Opciones de la consulta.
 * @returns {Promise<object[]>} - Un arreglo de objetos con el historial de órdenes.
 */
async function getHistoryOrders(options = {}) {
    return await spotService.getHistoryOrders(options);
}

/**
 * 💡 NUEVA FUNCIÓN AÑADIDA: Obtiene órdenes recientes que ya fueron llenadas o canceladas/llenadas.
 * Se utiliza para la lógica de respaldo en LBuying.js.
 * @param {string} symbol - Símbolo de trading (e.g., 'BTC_USDT').
 * @returns {Promise<object[]>} - Un arreglo de órdenes recientes.
 */
async function getRecentOrders(symbol) {
    // Usamos getHistoryOrders con un límite pequeño y estado 'all' para encontrar órdenes recientes.
    // getHistoryOrders ya maneja la normalización del estado 'all'.
    return await spotService.getHistoryOrders({ symbol, limit: 50 });
}

/**
 * Coloca una nueva orden.
 * @param {object} creds - Credenciales de la API.
 * @param {string} symbol - Símbolo de trading.
 * @param {string} side - 'buy' o 'sell'.
 * @param {string} type - 'limit' o 'market'.
 * @param {string} size - Cantidad de la orden.
 * @param {string} [price] - Precio para órdenes limit.
 * @returns {Promise<object>} - Respuesta de la API.
 */
// ⬇️ Firma de la función que acepta 'creds' y lo pasa a spotService
async function placeOrder(creds, symbol, side, type, amount, price) {
    return await spotService.placeOrder(symbol, side, type, amount, price);
}

/**
 * Obtiene los detalles de una orden específica.
 * ⚠️ PATCH CRÍTICO: Esta función ha sido modificada para usar getRecentOrders
 * como fuente principal de datos para evitar el bug de que spotService.getOrderDetail
 * solo devuelve órdenes abiertas ('opened').
 * @param {string} symbol - Símbolo de trading.
 * @param {string} orderId - ID de la orden.
 * @returns {Promise<object>} - Detalles de la orden.
 */
async function getOrderDetail(symbol, orderId) {
    // 1. Intentamos la consulta original para manejar errores de API, pero ignoramos el resultado fallido si la orden ya está llena.
    try {
        const details = await spotService.getOrderDetail(symbol, orderId);
        // Si el detalle se obtiene y tiene volumen (caso llenado rápido), lo usamos.
        if (details && (details.state === 'filled' || details.filledVolume > 0)) {
            return details;
        }
    } catch (e) {
        // console.warn(`Error al consultar getOrderDetail: ${e.message}. Recurriendo a historial.`);
        // No es necesario loguear aquí, ya que el error 50005 (orden llena) es común.
    }

    // 2. FORZAR la consulta al historial (getRecentOrders) para encontrar la orden,
    // ya que esta función SÍ trae los estados finales (filled, canceled, etc.).
    const recentOrders = await getRecentOrders(symbol);
    const orderInHistory = recentOrders.find(order => 
        String(order.orderId) === String(orderId) || String(order.order_id) === String(orderId)
    );
    
    // Devolvemos el detalle del historial (o null si no se encuentra).
    return orderInHistory || null;
}

/**
 * Cancela una orden.
 * @param {string} symbol - Símbolo de trading.
 * @param {string} order_id - ID de la orden.
 * @returns {Promise<object>} - Respuesta de la API.
 */
async function cancelOrder(symbol, order_id) {
    return await spotService.cancelOrder(symbol, order_id);
}

/**
 * Obtiene el ticker para un símbolo específico.
 * Simplemente reenviamos la llamada a spotService.
 */
async function getTicker(symbol) {
    return await spotService.getTicker(symbol);
}

/**
 * Obtiene los datos de velas (klines).
 * REEXPORTA la función desde bitmartSpot.js
 */
async function getKlines(symbol, interval, size) {
    return await spotService.getKlines(symbol, interval, size);
}

// 🚨 FUNCIÓN DE WRAPPER AÑADIDA PARA COMPATIBILIDAD CON orderManager.js
/**
 * Coloca una orden de mercado usando notional (USDT).
 * Nota: placeOrder en BitMart usa el campo 'size' para el notional en órdenes a mercado.
 */
async function placeMarketOrder({ symbol, side, notional }) {
    // spotService.placeOrder(symbol, side, type, size/notional, price)
    return await spotService.placeOrder(symbol, side, 'market', notional, null);
}

module.exports = {
    validateApiKeys,
    getBalance,
    getOpenOrders,
    getHistoryOrders,
    placeOrder,
    getOrderDetail,
    cancelOrder,
    getTicker,    
    getKlines,
    getAvailableTradingBalances,
    placeMarketOrder, 
    getRecentOrders,
};