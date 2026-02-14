/**
 * BSB/server/services/bitmartWs.js
 * GESTOR DE WEBSOCKETS PRIVADOS (Multi-usuario)
 * Versión 2026 - Firma Blindada y Manejo de Errores
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
    // 🛡️ VALIDACIÓN DE SEGURIDAD
    if (!credentials || !credentials.apiKey || !credentials.secretKey) {
        console.error(`${LOG_PREFIX} ❌ Error: Credenciales incompletas para usuario ${userId}.`);
        return;
    }

    const { apiKey, secretKey, memo } = credentials;

    // Evitar duplicidad de conexiones (fugas de memoria)
    if (userConnections[userId]) {
        console.log(`${LOG_PREFIX} Reestableciendo conexión previa para usuario: ${userId}`);
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
        console.log(`${LOG_PREFIX} ✅ [User: ${userId}] Socket Abierto. Autenticando...`);
        startHeartbeat();

        const timestamp = Date.now().toString();
        
        // CORRECCIÓN DE FIRMA: Aseguramos string vacío si no hay memo para evitar "undefined"
        const memoStr = memo || "";
        const message = `${timestamp}#${memoStr}#bitmart.WebSocket`;
        const sign = CryptoJS.HmacSHA256(message, secretKey).toString(CryptoJS.enc.Hex);

        const loginMessage = {
            op: "login",
            args: [apiKey, timestamp, sign]
        };

        wsClient.send(JSON.stringify(loginMessage));
    });

    wsClient.on('message', (data) => {
        const rawData = data.toString();
        
        // Filtro rápido para pings del sistema
        if (rawData === 'pong' || rawData === 'ping') return;

        try {
            const message = JSON.parse(rawData);

            // 1. MANEJO DE EVENTO LOGIN
            if (message.event === 'login') {
                if (message.code === 0) {
                    console.log(`${LOG_PREFIX} 🔑 [User: ${userId}] Autenticación Exitosa.`);
                    // Suscripción al canal de órdenes spot (Usa guion bajo _)
                    wsClient.send(JSON.stringify({
                        op: "subscribe",
                        args: ["spot/user/order:BTC_USDT"] 
                    }));
                } else {
                    console.error(`${LOG_PREFIX} ❌ Error de Auth [User: ${userId}]: ${message.msg} (Code: ${message.code})`);
                    stopOrderWebSocket(userId);
                }
            }

            // 2. PROCESAMIENTO DE ACTUALIZACIONES DE ÓRDENES
            if (message.table === 'spot/user/order' && message.data) {
                const normalizedOrders = message.data.map(o => ({
                    userId: userId, 
                    orderId: (o.order_id || o.orderId).toString(), // Forzamos string para evitar problemas de precisión
                    symbol: o.symbol,
                    side: (o.side || '').toUpperCase(),
                    type: (o.type || '').toUpperCase(),
                    price: o.price || o.price_avg || "0",
                    size: o.size || "0",
                    filledSize: o.filled_size || o.filledSize || "0",
                    status: (o.status || '').toUpperCase(),
                    orderTime: parseInt(o.update_time || o.create_time || Date.now())
                }));

                // Ejecutamos el callback de actualización
                if (typeof updateCallback === 'function') {
                    updateCallback(normalizedOrders);
                }
            }

        } catch (error) {
            if (!rawData.includes('pong')) {
                console.error(`${LOG_PREFIX} Error parseo JSON [User: ${userId}]:`, error.message);
            }
        }
    });

    wsClient.on('close', (code) => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        
        // Si el código no es 1000 (cierre normal), intentamos reconexión
        if (code !== 1000) {
            console.warn(`${LOG_PREFIX} ⚠️ [User: ${userId}] Conexión perdida (Code: ${code}). Reconectando en 5s...`);
            delete userConnections[userId];
            setTimeout(() => {
                initOrderWebSocket(userId, credentials, updateCallback);
            }, 5000);
        } else {
            console.log(`${LOG_PREFIX} 🛑 [User: ${userId}] Conexión cerrada limpiamente.`);
            delete userConnections[userId];
        }
    });

    wsClient.on('error', (err) => {
        console.error(`${LOG_PREFIX} ❌ Error en WS [User: ${userId}]:`, err.message);
    });

    // Guardar referencia activa para gestión de la sesión
    userConnections[userId] = { ws: wsClient, heartbeat: heartbeatInterval };
}

/**
 * Cierra la conexión de un usuario (ej: al apagar el bot)
 */
function stopOrderWebSocket(userId) {
    if (userConnections[userId]) {
        const { ws, heartbeat } = userConnections[userId];
        if (heartbeat) clearInterval(heartbeat);
        
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1000); // 1000 indica cierre normal
        }
        delete userConnections[userId];
        console.log(`${LOG_PREFIX} 🛑 Conexión finalizada para: ${userId}`);
    }
}

module.exports = { initOrderWebSocket, stopOrderWebSocket };