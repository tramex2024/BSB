/**
 * BSB/server/services/bitmartWs.js
 * GESTOR DE WEBSOCKETS PRIVADOS (Multi-usuario)
 */

const WebSocket = require('ws');
const CryptoJS = require('crypto-js');

const WS_URL = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1';
const LOG_PREFIX = '[BITMART_WS_PRIVATE]';

// Diccionario para mantener las conexiones de cada usuario
// { userId: { ws: WebSocket, heartbeat: Interval } }
const userConnections = {};

/**
 * Inicia un WebSocket privado para un usuario específico.
 */
function initOrderWebSocket(userId, credentials, updateCallback) {
    const { apiKey, secretKey, memo } = credentials;

    // Si ya existe una conexión activa para este usuario, la cerramos para evitar duplicados
    if (userConnections[userId]) {
        console.log(`${LOG_PREFIX} Reestableciendo conexión para usuario: ${userId}`);
        stopOrderWebSocket(userId);
    }

    const wsClient = new WebSocket(WS_URL);
    let heartbeatInterval = null;

    const startHeartbeat = () => {
        heartbeatInterval = setInterval(() => {
            if (wsClient.readyState === WebSocket.OPEN) {
                wsClient.send("ping"); 
            }
        }, 15000);
    };

    wsClient.on('open', () => {
        console.log(`${LOG_PREFIX} ✅ [User: ${userId}] Conectado. Autenticando...`);
        startHeartbeat();

        const timestamp = Date.now().toString();
        const message = `${timestamp}#${memo}#bitmart.WebSocket`;
        const sign = CryptoJS.HmacSHA256(message, secretKey).toString(CryptoJS.enc.Hex);

        const loginMessage = {
            op: "login",
            args: [apiKey, timestamp, sign]
        };

        wsClient.send(JSON.stringify(loginMessage));
    });

    wsClient.on('message', (data) => {
        const rawData = data.toString();
        if (rawData === 'pong') return;

        try {
            const message = JSON.parse(rawData);

            // 1. LOGIN EXITOSO
            if (message.event === 'login' && message.code === 0) {
                console.log(`${LOG_PREFIX} 🔑 [User: ${userId}] Auth Exitosa.`);
                wsClient.send(JSON.stringify({
                    op: "subscribe",
                    args: ["spot/user/order:BTC_USDT"] 
                }));
            }

            // 2. ACTUALIZACIÓN DE ORDEN
            if (message.table === 'spot/user/order' && message.data) {
                const normalizedOrders = message.data.map(o => ({
                    userId: userId, // <--- Importante: marcamos a quién pertenece la orden
                    orderId: o.order_id || o.orderId,
                    symbol: o.symbol,
                    side: o.side,
                    type: o.type,
                    price: o.price || o.price_avg,
                    size: o.size,
                    filledSize: o.filled_size || o.filledSize || "0",
                    status: o.status,
                    orderTime: o.update_time || o.create_time || Date.now()
                }));

                updateCallback(normalizedOrders);
            }

        } catch (error) {
            if (!rawData.includes('pong')) {
                console.error(`${LOG_PREFIX} Error parseo JSON [User: ${userId}]:`, error.message);
            }
        }
    });

    wsClient.on('close', (code) => {
        console.log(`${LOG_PREFIX} ⚠️ [User: ${userId}] Conexión cerrada (${code}).`);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        delete userConnections[userId];
        
        // Reconexión automática solo si el código no es un cierre voluntario
        if (code !== 1000) {
            setTimeout(() => initOrderWebSocket(userId, credentials, updateCallback), 5000);
        }
    });

    wsClient.on('error', (err) => {
        console.error(`${LOG_PREFIX} ❌ Error en WS [User: ${userId}]:`, err.message);
    });

    // Guardamos la referencia para control posterior
    userConnections[userId] = { ws: wsClient, heartbeat: heartbeatInterval };
}

/**
 * Cierra la conexión de un usuario (ej: cuando apaga el bot)
 */
function stopOrderWebSocket(userId) {
    if (userConnections[userId]) {
        const { ws, heartbeat } = userConnections[userId];
        if (heartbeat) clearInterval(heartbeat);
        ws.terminate();
        delete userConnections[userId];
        console.log(`${LOG_PREFIX} 🛑 Conexión eliminada para usuario: ${userId}`);
    }
}

module.exports = { initOrderWebSocket, stopOrderWebSocket };