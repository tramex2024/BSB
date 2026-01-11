// BSB/server/services/bitmartWs.js

// server/services/bitmartWs.js
const { WebSocket } = require('ws');
const CryptoJS = require('crypto-js');

const WS_URL = 'wss://ws-manager-compress.bitmart.com/user?protocol=1.1'; // Protocolo recomendado para user data
const LOG_PREFIX = '[BITMART_WS]';

let wsClient = null;
let heartbeatInterval = null;

function initOrderWebSocket(updateCallback) {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) return;

    wsClient = new WebSocket(WS_URL);

    const startHeartbeat = () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (wsClient?.readyState === WebSocket.OPEN) wsClient.send("ping");
        }, 20000);
    };

    wsClient.on('open', () => {
        console.log(`${LOG_PREFIX} ✅ Conexión abierta. Autenticando...`);
        startHeartbeat();

        // --- PASO OBLIGATORIO: LOGIN ---
        const { BITMART_API_KEY, BITMART_SECRET_KEY, BITMART_API_MEMO } = process.env;
        const timestamp = Date.now().toString();
        const message = `${timestamp}#${BITMART_API_MEMO}#bitmart.WebSocket`;
        const sign = CryptoJS.HmacSHA256(message, BITMART_SECRET_KEY).toString(CryptoJS.enc.Hex);

        const authMessage = {
            op: "login",
            args: [BITMART_API_KEY, timestamp, sign, BITMART_API_MEMO]
        };
        wsClient.send(JSON.stringify(authMessage));
    });

    wsClient.on('message', (data) => {
        const rawData = data.toString();
        if (rawData === 'pong') return;

        try {
            const message = JSON.parse(rawData);

            // 1. Confirmación de Login
            if (message.event === 'login') {
                console.log(`${LOG_PREFIX} 🔓 Autenticado con éxito. Suscribiendo a órdenes...`);
                wsClient.send(JSON.stringify({
                    op: "subscribe",
                    args: ["spot/user/order:BTC_USDT"]
                }));
            }

            // 2. Recepción de Órdenes (Aquí es donde veremos la PENDING)
            if (message.table === 'spot/user/order' || (message.topic && message.topic.includes('order'))) {
                const updatedOrders = message.data || message.data?.list;
                
                // --- LOG DE DEBUG PARA ÓRDENES PENDING ---
                console.log(`${LOG_PREFIX} 📥 EVENTO DE ORDEN RECIBIDO:`);
                console.dir(updatedOrders, { depth: null });

                updateCallback(updatedOrders);
            }

        } catch (error) {
            if (rawData !== 'pong') console.error(`${LOG_PREFIX} Error parse:`, error.message);
        }
    });

    wsClient.on('close', () => {
        console.log(`${LOG_PREFIX} ⚠️ Desconectado. Reconectando...`);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        setTimeout(() => initOrderWebSocket(updateCallback), 3000);
    });
}

module.exports = { initOrderWebSocket };