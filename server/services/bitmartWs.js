// BSB/server/services/bitmartWs.js

const { WebSocket } = require('ws');

const WS_URL = 'wss://ws-manager-compress.bitmart.com';
const LOG_PREFIX = '[BITMART_WS]';

let wsClient = null;
let heartbeatInterval = null; // 🟢 Nuevo: Para mantener la conexión viva

/**
 * Inicia la conexión WebSocket y suscribe las órdenes del usuario.
 */
function initOrderWebSocket(updateCallback) {
    if (wsClient) {
        // Si el estado no es OPEN, forzamos cierre para limpiar
        if (wsClient.readyState !== WebSocket.OPEN) {
            wsClient.terminate();
        } else {
            return;
        }
    }

    wsClient = new WebSocket(WS_URL);

    // 🟢 Nuevo: Función para enviar PING proactivamente
    const startHeartbeat = () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                // BitMart espera un mensaje de texto "ping" o un JSON según el canal
                wsClient.send("ping"); 
            }
        }, 20000); // Cada 20 segundos
    };

    wsClient.on('open', () => {
        console.log(`${LOG_PREFIX} ✅ Conexión exitosa. Suscribiendo...`);
        startHeartbeat(); // Iniciamos el latido

        // Suscripción (Asegúrate de que tu auth de BitMart esté configurada si usas user data)
        const subscriptionMessage = {
            op: "subscribe",
            args: ["spot/user/order:BTC_USDT"] 
        };
        wsClient.send(JSON.stringify(subscriptionMessage));
    });

    wsClient.on('message', (data) => {
        const rawData = data.toString();
        
        // Manejo rápido de Pong para no saturar el log
        if (rawData === 'pong' || rawData.includes('"event":"pong"')) return;

        try {
            const message = JSON.parse(rawData);
            
            if (message.event === 'update' && message.topic && message.topic.startsWith('spot/user/order')) {
                const updatedOrders = message.data;
                updateCallback(updatedOrders);
            }
            
            // Responder a Pings del servidor
            if (message.event === 'ping') {
                wsClient.send(JSON.stringify({ event: 'pong' }));
            }
            
        } catch (error) {
            // Algunos mensajes de BitMart son strings planos (como "pong")
            if (rawData !== 'pong') {
                console.error(`${LOG_PREFIX} Error al procesar mensaje:`, error.message);
            }
        }
    });

    wsClient.on('error', (error) => {
        console.error(`${LOG_PREFIX} ❌ Error:`, error.message);
    });

    wsClient.on('close', () => {
        console.log(`${LOG_PREFIX} ⚠️ Conexión cerrada. Reconectando en 2s...`);
        
        // Limpiar intervalos para evitar fugas de memoria
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        wsClient = null; 

        // 🟢 Reducido a 2 segundos para no perder ventanas de RSI
        setTimeout(() => initOrderWebSocket(updateCallback), 2000); 
    });
}

module.exports = { initOrderWebSocket };