// BSB/server/services/bitmartWs.js

const { WebSocket } = require('ws');
const CryptoJS = require('crypto-js');

const WS_URL = 'wss://ws-manager-compress.bitmart.com/user?protocol=1';
const LOG_PREFIX = '[BITMART_WS]';

let wsClient = null;
let heartbeatInterval = null;

/**
 * Genera la firma requerida para el login de WebSocket en BitMart
 */
function generateWsSignature(timestamp, apiKey, secretKey, memo) {
    const message = `${timestamp}#${memo}#bitmart.WebSocket`;
    return CryptoJS.HmacSHA256(message, secretKey).toString(CryptoJS.enc.Hex);
}

/**
 * Inicia la conexión WebSocket, autentica y suscribe las órdenes del usuario.
 */
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
        }, 15000); // Intervalo optimizado a 15s
    };

    wsClient.on('open', () => {
        console.log(`${LOG_PREFIX} ✅ Conexión abierta. Autenticando...`);
        startHeartbeat();

        const { BITMART_API_KEY, BITMART_SECRET_KEY, BITMART_API_MEMO } = process.env;
        const timestamp = Date.now().toString();
        const sign = generateWsSignature(timestamp, BITMART_API_KEY, BITMART_SECRET_KEY, BITMART_API_MEMO);

        // FASE 1: Login obligatorio para canales privados
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
            
            // FASE 2: Verificar si el login fue exitoso antes de suscribir
            if (message.event === 'login' && message.code === '0') {
                console.log(`${LOG_PREFIX} 🔑 Login exitoso. Suscribiendo a órdenes BTC_USDT...`);
                wsClient.send(JSON.stringify({
                    op: "subscribe",
                    args: ["spot/user/order:BTC_USDT"]
                }));
                return;
            }

            // FASE 3: Procesar actualizaciones de órdenes
            // BitMart puede usar 'table' o 'topic' dependiendo de la versión del balanceador
            const isOrderUpdate = message.table === 'spot/user/order' || 
                                 (message.topic && message.topic.startsWith('spot/user/order'));

            if (isOrderUpdate && message.data) {
                updateCallback(message.data);
            }
            
            // Respuesta a pings del servidor
            if (message.event === 'ping') {
                wsClient.send(JSON.stringify({ event: 'pong' }));
            }
            
        } catch (error) {
            if (rawData !== 'pong') {
                console.error(`${LOG_PREFIX} Error al procesar mensaje:`, error.message);
            }
        }
    });

    wsClient.on('error', (error) => {
        console.error(`${LOG_PREFIX} ❌ Error:`, error.message);
    });

    wsClient.on('close', () => {
        console.log(`${LOG_PREFIX} ⚠️ Conexión cerrada. Reconectando en 3s...`);
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        wsClient = null; 
        setTimeout(() => initOrderWebSocket(updateCallback), 3000); 
    });
}

module.exports = { initOrderWebSocket };