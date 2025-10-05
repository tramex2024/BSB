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
 * Coloca una nueva orden.
 * @param {string} symbol - Símbolo de trading.
 * @param {string} side - 'buy' o 'sell'.
 * @param {string} type - 'limit' o 'market'.
 * @param {string} size - Cantidad de la orden.
 * @param {string} [price] - Precio para órdenes limit.
 * @returns {Promise<object>} - Respuesta de la API.
 */
async function placeOrder(symbol, side, type, size, price) {
    return await spotService.placeOrder(symbol, side, type, size, price);
}

/**
 * Obtiene los detalles de una orden específica con reintentos.
 * @param {string} symbol - Símbolo de trading.
 * @param {string} orderId - ID de la orden.
 * @returns {Promise<object>} - Detalles de la orden.
 */
async function getOrderDetail(symbol, orderId) {
    return await spotService.getOrderDetail(symbol, orderId);
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

module.exports = {
    validateApiKeys,
    getBalance,
    getOpenOrders,
    getHistoryOrders,
    placeOrder,
    getOrderDetail,
    cancelOrder,
    getTicker
};