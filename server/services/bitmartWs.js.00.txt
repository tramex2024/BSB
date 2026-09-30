/**
 * BSB/server/services/bitmartWs.js
 * GESTOR DE WEBSOCKETS PRIVADOS (Multi-usuario)
 * Versión 2026 - Protegida contra fallos de inicialización
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
    // 🛡️ VALIDACIÓN DE SEGURIDAD (Evita el crash en el despliegue)
    if (!credentials || !credentials.apiKey || !credentials.secretKey) {
        console.error(`${LOG_PREFIX} ❌ Error: No se puede iniciar WS para el usuario ${userId}. Credenciales indefinidas o incompletas.`);
        return;
    }

    const { apiKey, secretKey, memo } = credentials;

    // Si ya existe una conexión activa para este usuario, la cerramos para evitar fugas de memoria
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
        // Mensaje de firma según documentación BitMart 2026
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

            // 1. CONFIRMACIÓN DE LOGIN
            if (message.event === 'login' && message.code === 0) {
                console.log(`${LOG_PREFIX} 🔑 [User: ${userId}] Autenticación Exitosa.`);
                // Suscripción al canal de órdenes spot
                wsClient.send(JSON.stringify({
                    op: "subscribe",
                    args: ["spot/user/order:BTC_USDT"] 
                }));
            }

            // 2. RECEPCIÓN DE ACTUALIZACIONES DE ÓRDENES
            if (message.table === 'spot/user/order' && message.data) {
                const normalizedOrders = message.data.map(o => ({
                    userId: userId, 
                    orderId: o.order_id || o.orderId,
                    symbol: o.symbol,
                    side: o.side, // BUY / SELL
                    type: o.type, // MARKET / LIMIT
                    price: o.price || o.price_avg,
                    size: o.size,
                    filledSize: o.filled_size || o.filledSize || "0",
                    status: o.status, // FILLED, PARTIALLY_FILLED, CANCELED
                    orderTime: o.update_time || o.create_time || Date.now()
                }));

                // Enviamos los datos al callback (usualmente procesado en autobotLogic)
                updateCallback(normalizedOrders);
            }

        } catch (error) {
            if (!rawData.includes('pong')) {
                console.error(`${LOG_PREFIX} Error parseo JSON [User: ${userId}]:`, error.message);
            }
        }
    });

    wsClient.on('close', (code) => {
        console.log(`${LOG_PREFIX} ⚠️ [User: ${userId}] Conexión cerrada (Código: ${code}).`);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        delete userConnections[userId];
        
        // Reconexión automática (Backoff de 5s)
        if (code !== 1000) {
            setTimeout(() => {
                // Volvemos a intentar la conexión si el usuario sigue existiendo
                initOrderWebSocket(userId, credentials, updateCallback);
            }, 5000);
        }
    });

    wsClient.on('error', (err) => {
        console.error(`${LOG_PREFIX} ❌ Error en WS [User: ${userId}]:`, err.message);
    });

    // Guardamos la referencia activa
    userConnections[userId] = { ws: wsClient, heartbeat: heartbeatInterval };
}

/**
 * Cierra la conexión de un usuario (ej: cuando apaga el bot o se desconecta)
 */
function stopOrderWebSocket(userId) {
    if (userConnections[userId]) {
        const { ws, heartbeat } = userConnections[userId];
        if (heartbeat) clearInterval(heartbeat);
        
        // Cerramos con código 1000 para evitar la reconexión automática
        ws.close(1000); 
        delete userConnections[userId];
        console.log(`${LOG_PREFIX} 🛑 Conexión cerrada voluntariamente: ${userId}`);
    }
}

module.exports = { initOrderWebSocket, stopOrderWebSocket };