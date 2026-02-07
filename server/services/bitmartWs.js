// BSB/server/services/bitmartWs.js

const WebSocket = require('ws');
const CryptoJS = require('crypto-js');

const WS_URL = 'wss://ws-manager-compress.bitmart.com/api?protocol=1.1';
const LOG_PREFIX = '[BITMART_WS]';

let wsClient = null;
let heartbeatInterval = null;

function initOrderWebSocket(updateCallback) {
    if (wsClient) {
        if (wsClient.readyState !== WebSocket.OPEN) {
            wsClient.terminate();
        } else {
            return; 
        }
    }

    wsClient = new WebSocket(WS_URL);

    const startHeartbeat = () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                wsClient.send("ping"); 
            }
        }, 15000);
    };

    wsClient.on('open', () => {
        console.log(`${LOG_PREFIX} ✅ Conectado. Autenticando...`);
        startHeartbeat();

        const { BITMART_API_KEY, BITMART_SECRET_KEY, BITMART_API_MEMO } = process.env;
        const timestamp = Date.now().toString();
        
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

            // --- 2. ACTUALIZACIÓN DE ORDEN (NORMALIZACIÓN) ---
            // BitMart v4 envía los datos en message.data que es un ARRAY
            if (message.table === 'spot/user/order' && message.data) {
                console.log(`${LOG_PREFIX} 📦 Actualización recibida (${message.data.length} items)`);
                
                // Normalizamos los datos antes de enviarlos al callback (socket.io)
                // Esto asegura que el frontend reciba campos consistentes (orderId, price, size)
                const normalizedOrders = message.data.map(o => ({
                    orderId: o.order_id || o.orderId,
                    symbol: o.symbol,
                    side: o.side,
                    type: o.type,
                    price: o.price || o.price_avg,
                    size: o.size,
                    filledSize: o.filled_size || o.filledSize || "0",
                    status: o.status, // Aquí viene el estado: "1", "4", "6", etc.
                    orderTime: o.update_time || o.create_time || Date.now()
                }));

                updateCallback(normalizedOrders);
            }

            if (message.event === 'error') {
                console.error(`${LOG_PREFIX} ❌ Error WS:`, message.message || message.code);
            }

        } catch (error) {
            if (!rawData.includes('pong')) {
                console.error(`${LOG_PREFIX} Error parseo JSON:`, error.message);
            }
        }
    });

    wsClient.on('error', (error) => {
        console.error(`${LOG_PREFIX} ❌ Error de red:`, error.message);
    });

    wsClient.on('close', (code) => {
        console.log(`${LOG_PREFIX} ⚠️ Conexión cerrada (${code}). Reconectando en 3s...`);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        wsClient = null; 
        setTimeout(() => initOrderWebSocket(updateCallback), 3000); 
    });
}

module.exports = { initOrderWebSocket };