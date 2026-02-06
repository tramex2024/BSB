// BSB/server/services/bitmartWs.js

const { WebSocket } = require('ws');
const CryptoJS = require('crypto-js');

const WS_URL = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1';
const LOG_PREFIX = '[BITMART_WS]';

let wsClient = null;
let heartbeatInterval = null;

function initOrderWebSocket(updateCallback) {
    // Si ya existe un cliente, limpiamos antes de crear uno nuevo
    if (wsClient) {
        if (wsClient.readyState !== WebSocket.OPEN) {
            wsClient.terminate();
        } else {
            return; // Ya está abierto y funcional
        }
    }

    wsClient = new WebSocket(WS_URL);

    const startHeartbeat = () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                wsClient.send("ping"); 
            }
        }, 15000); // Bajamos a 15s para mayor seguridad en Render/Heroku
    };

    wsClient.on('open', () => {
        console.log(`${LOG_PREFIX} ✅ Conectado. Autenticando...`);
        startHeartbeat();

        const { BITMART_API_KEY, BITMART_SECRET_KEY, BITMART_API_MEMO } = process.env;
        const timestamp = Date.now().toString();
        
        // Firma: timestamp + "#" + memo + "#" + "bitmart.WebSocket"
        const message = `${timestamp}#${BITMART_API_MEMO}#bitmart.WebSocket`;
        const sign = CryptoJS.HmacSHA256(message, BITMART_SECRET_KEY).toString(CryptoJS.enc.Hex);

        const loginMessage = {
            op: "login",
            args: [BITMART_API_KEY, timestamp, sign]
        };

        wsClient.send(JSON.stringify(loginMessage));
    });

    wsClient.on('message', (data) => {
        const rawData = data.toString();
        if (rawData === 'pong') return;

        try {
            const message = JSON.parse(rawData);

            // --- 1. LOGIN EXITOSO ---
            if (message.event === 'login' && message.code === 0) {
                console.log(`${LOG_PREFIX} 🔑 Auth Exitosa. Suscribiendo a órdenes...`);
                wsClient.send(JSON.stringify({
                    op: "subscribe",
                    args: ["spot/user/order:BTC_USDT"] 
                }));
            }

            // --- 2. CONFIRMACIÓN DE SUSCRIPCIÓN ---
            if (message.event === 'subscribe' && message.topic === 'spot/user/order:BTC_USDT') {
                console.log(`${LOG_PREFIX} 📡 Suscripción confirmada para BTC_USDT.`);
            }

            // --- 3. ACTUALIZACIÓN DE ORDEN (EVENTO CRÍTICO) ---
            if (message.table === 'spot/user/order' || (message.event === 'update' && message.topic?.includes('spot/user/order'))) {
                console.log(`${LOG_PREFIX} 📦 Movimiento en órdenes detectado.`);
                // BitMart a veces envía un array en .data o el objeto directo
                const orderData = message.data || message;
                updateCallback(orderData);
            }

            if (message.event === 'error') {
                console.error(`${LOG_PREFIX} ❌ Error del servidor WS:`, message.message || message.code);
            }

        } catch (error) {
            // Silenciamos pings/pongs que no son JSON válido
            if (!rawData.includes('pong')) {
                console.error(`${LOG_PREFIX} Error parseo JSON:`, error.message);
            }
        }
    });

    wsClient.on('error', (error) => {
        console.error(`${LOG_PREFIX} ❌ Error de red:`, error.message);
    });

    wsClient.on('close', (code, reason) => {
        console.log(`${LOG_PREFIX} ⚠️ Conexión cerrada (${code}). Reconectando en 3s...`);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        wsClient = null; 
        setTimeout(() => initOrderWebSocket(updateCallback), 3000); 
    });
}

module.exports = { initOrderWebSocket };