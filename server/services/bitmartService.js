// Archivo: BSB/server/services/bitmartService.js
const spotService = require('./bitmartSpot');

const LOG_PREFIX = '[BITMART_SERVICE]';

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

async function getBalance(creds) {
    return await spotService.getBalance(creds);
}

async function getOpenOrders(creds, symbol) {
    return await spotService.getOpenOrders(creds, symbol);
}

async function getHistoryOrders(creds, options = {}) {
    return await spotService.getHistoryOrders(creds, options);
}

async function placeOrder(creds, symbol, side, type, size, price) {
    return await spotService.placeOrder(creds, symbol, side, type, size, price);
}

async function getOrderDetail(creds, symbol, orderId) {
    return await spotService.getOrderDetail(creds, symbol, orderId);
}

async function cancelOrder(creds, symbol, order_id) {
    return await spotService.cancelOrder(creds, symbol, order_id);
}

async function getTicker(creds, symbol) {
    return await spotService.getTicker(creds, symbol);
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