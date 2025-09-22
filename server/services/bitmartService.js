// Archivo: BSB/server/services/bitmartService.js

const spotService = require('./bitmartSpot');

const LOG_PREFIX = '[BITMART_SERVICE]';

/**
 * Valida las credenciales de la API de BitMart.
 * @param {object} creds - Objeto con las credenciales (apiKey, secretKey, apiMemo).
 * @returns {Promise<boolean>} - Verdadero si las credenciales son válidas, falso en caso contrario.
 */
async function validateApiKeys(creds) {
    try {
        console.log('\n--- Iniciando validación de credenciales API de BitMart ---');
        await spotService.getBalance(creds);
        console.log('✅ Credenciales API de BitMart validadas con éxito. CONECTADO.');
        return true;
    } catch (error) {
        console.error('❌ Falló la validación de credenciales API de BitMart:', error.message);
        return false;
    }
}

/**
 * Obtiene los balances de la billetera.
 * @param {object} creds - Objeto con las credenciales.
 * @returns {Promise<object[]>} - Un arreglo de objetos de balance.
 */
async function getBalance(creds) {
    return await spotService.getBalance(creds);
}

/**
 * Obtiene las órdenes abiertas para un símbolo específico.
 * @param {object} creds - Objeto con las credenciales.
 * @param {string} symbol - Símbolo de trading (e.g., 'BTC_USDT').
 * @returns {Promise<object>} - Un objeto con la lista de órdenes abiertas.
 */
async function getOpenOrders(creds, symbol) {
    return await spotService.getOpenOrders(creds, symbol);
}

/**
 * Obtiene el historial de órdenes para un símbolo y estado.
 * @param {object} creds - Objeto con las credenciales.
 * @param {object} options - Opciones de la consulta.
 * @returns {Promise<object[]>} - Un arreglo de objetos con el historial de órdenes.
 */
async function getHistoryOrders(creds, options = {}) {
    return await spotService.getHistoryOrders(creds, options);
}

/**
 * Coloca una nueva orden.
 * @param {object} creds - Objeto con las credenciales.
 * @param {string} symbol - Símbolo de trading.
 * @param {string} side - 'buy' o 'sell'.
 * @param {string} type - 'limit' o 'market'.
 * @param {string} size - Cantidad de la orden.
 * @param {string} [price] - Precio para órdenes limit.
 * @returns {Promise<object>} - Respuesta de la API.
 */
async function placeOrder(creds, symbol, side, type, size, price) {
    return await spotService.placeOrder(creds, symbol, side, type, size, price);
}

/**
 * Obtiene los detalles de una orden específica con reintentos.
 * @param {object} creds - Objeto con las credenciales.
 * @param {string} symbol - Símbolo de trading.
 * @param {string} orderId - ID de la orden.
 * @returns {Promise<object>} - Detalles de la orden.
 */
async function getOrderDetail(creds, symbol, orderId) {
    return await spotService.getOrderDetail(creds, symbol, orderId);
}

/**
 * Cancela una orden.
 * @param {object} creds - Objeto con las credenciales.
 * @param {string} symbol - Símbolo de trading.
 * @param {string} order_id - ID de la orden.
 * @returns {Promise<object>} - Respuesta de la API.
 */
async function cancelOrder(creds, symbol, order_id) {
    return await spotService.cancelOrder(creds, symbol, order_id);
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