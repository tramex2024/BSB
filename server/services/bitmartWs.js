// BSB/server/services/bitmartWs.js

const { WebSocket } = require('ws');
const CryptoJS = require('crypto-js'); // Necesario para la firma

const WS_URL = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1&compression=true';
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
        console.log(`${LOG_PREFIX} ✅ Socket Abierto. Autenticando...`);
        startHeartbeat();

        // --- PASO 1: LOGIN (Obligatorio para datos privados) ---
        const { BITMART_API_KEY, BITMART_SECRET_KEY, BITMART_API_MEMO } = process.env;
        const timestamp = Date.now().toString();
        const message = `${timestamp}#${BITMART_API_MEMO}#bitmart.WebSocket`;
        const sign = CryptoJS.HmacSHA256(message, BITMART_SECRET_KEY).toString(CryptoJS.enc.Hex);

        const loginMessage = {
            op: "login",
            args: [BITMART_API_KEY, timestamp, sign, BITMART_API_MEMO]
        };
        wsClient.send(JSON.stringify(loginMessage));
    });

    wsClient.on('message', (data) => {
        const rawData = data.toString();
        if (rawData === 'pong') return;

        try {
            const message = JSON.parse(rawData);

            // --- PASO 2: SUSCRIBIR TRAS LOGIN EXITOSO ---
            if (message.event === 'login') {
                console.log(`${LOG_PREFIX} 👤 Login Exitoso. Suscribiendo a órdenes...`);
                wsClient.send(JSON.stringify({
                    op: "subscribe",
                    args: ["spot/user/order:BTC_USDT"]
                }));
            }

            // --- PASO 3: CAPTURAR ACTUALIZACIONES ---
            if (message.table === 'spot/user/order' || (message.topic && message.topic.includes('order'))) {
                const updatedOrders = message.data || [];
                // Enviamos el array directamente al callback
                updateCallback(updatedOrders);
            }

        } catch (error) {
            if (rawData !== 'pong') console.error(`${LOG_PREFIX} Error parsing:`, error.message);
        }
    });

    wsClient.on('close', () => {
        console.log(`${LOG_PREFIX} ⚠️ Cerrado. Reconectando...`);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        setTimeout(() => initOrderWebSocket(updateCallback), 3000);
    });
}

module.exports = { initOrderWebSocket };