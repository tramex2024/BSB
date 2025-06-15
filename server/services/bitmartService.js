const axios = require('axios');
const crypto = require('crypto');
const User = require('../models/User'); // Importa el modelo de usuario para obtener claves
const { decrypt } = require('../utils/encryption'); // Importa la función de desencriptación

const BASE_URL = 'https://api-cloud.bitmart.com';
const API_KEY_HEADER = 'X-BM-KEY';
const API_SIGN_HEADER = 'X-BM-SIGN';
const API_TIMESTAMP_HEADER = 'X-BM-TIMESTAMP';
const API_MEMO_HEADER = 'X-BM-MEMO';

// Función para generar la firma de BitMart
function createSignature(secretKey, timestamp, memo, body = '') {
    const message = timestamp + memo + body;
    return crypto.createHmac('sha256', secretKey).update(message).digest('hex');
}

// Función auxiliar para obtener las credenciales de un usuario
async function getUserCredentials(userId) {
    const user = await User.findById(userId);
    if (!user || !user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) {
        console.error(`[BitMart Service] Credenciales de BitMart no encontradas para el usuario ${userId}.`);
        return null;
    }
    const decryptedSecretKey = decrypt(user.bitmartSecretKeyEncrypted);
    return {
        apiKey: user.bitmartApiKey,
        secretKey: decryptedSecretKey,
        memo: user.bitmartApiMemo || ''
    };
}

// Función para validar las claves API de BitMart (sin userId, para el modal)
async function validateApiKeys(apiKey, secretKey, memo = '') {
    const path = '/spot/v1/currencies'; // Un endpoint público que requiere autenticación
    const timestamp = Date.now().toString();
    const signature = createSignature(secretKey, timestamp, memo);

    try {
        const response = await axios.get(`${BASE_URL}${path}`, {
            headers: {
                [API_KEY_HEADER]: apiKey,
                [API_SIGN_HEADER]: signature,
                [API_TIMESTAMP_HEADER]: timestamp,
                [API_MEMO_HEADER]: memo
            }
        });
        // Si la respuesta es exitosa (código 200) y tiene los datos esperados, las claves son válidas.
        return response.data && response.data.code === 1000;
    } catch (error) {
        console.error('Error validating BitMart API Keys:', error.response ? error.response.data : error.message);
        return false;
    }
}

// Obtener información del ticker para un símbolo
async function getTicker(symbol) {
    try {
        const response = await axios.get(`${BASE_URL}/spot/v1/ticker?symbol=${symbol}`);
        if (response.data && response.data.code === 1000 && response.data.data && response.data.data.length > 0) {
            return {
                symbol: response.data.data[0].symbol,
                last: response.data.data[0].last_price,
                high: response.data.data[0].high_24h,
                low: response.data.data[0].low_24h,
                volume: response.data.data[0].volume_24h
            };
        }
        return null;
    } catch (error) {
        console.error('Error fetching ticker:', error.response ? error.response.data : error.message);
        return null;
    }
}

// Obtener balance de la cuenta para un usuario
async function getBalance(userId) {
    const credentials = await getUserCredentials(userId);
    if (!credentials) return [];

    const path = '/spot/v1/wallet';
    const timestamp = Date.now().toString();
    const signature = createSignature(credentials.secretKey, timestamp, credentials.memo);

    try {
        const response = await axios.get(`${BASE_URL}${path}`, {
            headers: {
                [API_KEY_HEADER]: credentials.apiKey,
                [API_SIGN_HEADER]: signature,
                [API_TIMESTAMP_HEADER]: timestamp,
                [API_MEMO_HEADER]: credentials.memo
            }
        });

        if (response.data && response.data.code === 1000 && response.data.data && response.data.data.wallet) {
            return response.data.data.wallet.map(item => ({
                currency: item.currency,
                available: item.available,
                frozen: item.frozen
            }));
        }
        console.warn(`[BitMart Service] No se pudieron obtener los balances para el usuario ${userId}. Respuesta:`, response.data);
        return [];
    } catch (error) {
        console.error(`[BitMart Service] Error al obtener balances para el usuario ${userId}:`, error.response ? error.response.data : error.message);
        return [];
    }
}

// Colocar una orden
async function placeOrder(userId, symbol, side, type, size, price = null) {
    const credentials = await getUserCredentials(userId);
    if (!credentials) throw new Error('Credenciales de BitMart no disponibles para el usuario.');

    const path = '/spot/v2/submit_order';
    const timestamp = Date.now().toString();
    const body = {
        symbol: symbol,
        side: side, // 'buy' or 'sell'
        type: type, // 'market' or 'limit'
        size: size.toString()
    };
    if (type === 'limit' && price !== null) {
        body.price = price.toString();
    }

    const signature = createSignature(credentials.secretKey, timestamp, credentials.memo, JSON.stringify(body));

    try {
        const response = await axios.post(`${BASE_URL}${path}`, body, {
            headers: {
                [API_KEY_HEADER]: credentials.apiKey,
                [API_SIGN_HEADER]: signature,
                [API_TIMESTAMP_HEADER]: timestamp,
                [API_MEMO_HEADER]: credentials.memo,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.code === 1000 && response.data.data) {
            return {
                order_id: response.data.data.order_id,
                client_order_id: response.data.data.client_order_id // Puede ser útil
            };
        }
        console.error(`[BitMart Service] Error al colocar orden para el usuario ${userId}. Respuesta:`, response.data);
        throw new Error(response.data.message || 'Error al colocar orden.');
    } catch (error) {
        console.error(`[BitMart Service] Excepción al colocar orden para el usuario ${userId}:`, error.response ? error.response.data : error.message);
        throw error;
    }
}

// Obtener detalles de una orden
async function getOrderDetail(userId, orderId) {
    const credentials = await getUserCredentials(userId);
    if (!credentials) throw new Error('Credenciales de BitMart no disponibles para el usuario.');

    const path = '/spot/v1/order/detail';
    const timestamp = Date.now().toString();
    const body = { order_id: orderId };
    const signature = createSignature(credentials.secretKey, timestamp, credentials.memo, JSON.stringify(body));

    try {
        const response = await axios.post(`${BASE_URL}${path}`, body, {
            headers: {
                [API_KEY_HEADER]: credentials.apiKey,
                [API_SIGN_HEADER]: signature,
                [API_TIMESTAMP_HEADER]: timestamp,
                [API_MEMO_HEADER]: credentials.memo,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.code === 1000 && response.data.data) {
            const order = response.data.data.order;
            // Simplificar la respuesta para lo que el bot necesita
            return {
                order_id: order.order_id,
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                state: order.state, // 'new', 'filled', 'partially_filled', 'canceled'
                price: parseFloat(order.price),
                size: parseFloat(order.size),
                filled_size: parseFloat(order.filled_size || order.size), // Si está llena, size es filled_size
                executed_price: parseFloat(order.executed_price || order.price) // Precio promedio de ejecución
            };
        }
        console.error(`[BitMart Service] Error al obtener detalles de la orden ${orderId} para el usuario ${userId}. Respuesta:`, response.data);
        return null;
    } catch (error) {
        console.error(`[BitMart Service] Excepción al obtener detalles de la orden ${orderId} para el usuario ${userId}:`, error.response ? error.response.data : error.message);
        return null;
    }
}

// Obtener órdenes abiertas (pendientes)
async function getOpenOrders(userId, symbol) {
    const credentials = await getUserCredentials(userId);
    if (!credentials) return [];

    const path = '/spot/v1/open_orders';
    const timestamp = Date.now().toString();
    const body = { symbol: symbol };
    const signature = createSignature(credentials.secretKey, timestamp, credentials.memo, JSON.stringify(body));

    try {
        const response = await axios.post(`${BASE_URL}${path}`, body, {
            headers: {
                [API_KEY_HEADER]: credentials.apiKey,
                [API_SIGN_HEADER]: signature,
                [API_TIMESTAMP_HEADER]: timestamp,
                [API_MEMO_HEADER]: credentials.memo,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.code === 1000 && response.data.data && response.data.data.current_page_orders) {
            return response.data.data.current_page_orders.map(order => ({
                order_id: order.order_id,
                symbol: order.symbol,
                side: order.side,
                type: order.type,
                price: parseFloat(order.price),
                size: parseFloat(order.size),
                state: order.state
            }));
        }
        console.warn(`[BitMart Service] No se encontraron órdenes abiertas para ${symbol} para el usuario ${userId}. Respuesta:`, response.data);
        return [];
    } catch (error) {
        console.error(`[BitMart Service] Error al obtener órdenes abiertas para ${userId}:`, error.response ? error.response.data : error.message);
        return [];
    }
}

// Cancelar una orden
async function cancelOrder(userId, symbol, orderId) {
    const credentials = await getUserCredentials(userId);
    if (!credentials) throw new Error('Credenciales de BitMart no disponibles para el usuario.');

    const path = '/spot/v1/cancel_order';
    const timestamp = Date.now().toString();
    const body = { symbol: symbol, order_id: orderId };
    const signature = createSignature(credentials.secretKey, timestamp, credentials.memo, JSON.stringify(body));

    try {
        const response = await axios.post(`${BASE_URL}${path}`, body, {
            headers: {
                [API_KEY_HEADER]: credentials.apiKey,
                [API_SIGN_HEADER]: signature,
                [API_TIMESTAMP_HEADER]: timestamp,
                [API_MEMO_HEADER]: credentials.memo,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.code === 1000) {
            return { success: true, message: `Order ${orderId} cancelled.` };
        }
        console.error(`[BitMart Service] Error al cancelar orden ${orderId} para el usuario ${userId}. Respuesta:`, response.data);
        throw new Error(response.data.message || 'Error al cancelar orden.');
    } catch (error) {
        console.error(`[BitMart Service] Excepción al cancelar orden ${orderId} para el usuario ${userId}:`, error.response ? error.response.data : error.message);
        throw error;
    }
}


module.exports = {
    validateApiKeys,
    getTicker,
    getBalance,
    placeOrder,
    getOrderDetail,
    getOpenOrders,
    cancelOrder
};