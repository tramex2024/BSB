// BSB/server/services/bitmartWs.js

const { WebSocket } = require('ws'); // Asegúrate de tener 'ws' instalado (npm install ws)

const WS_URL = 'wss://ws-manager-compress.bitmart.com';
const LOG_PREFIX = '[BITMART_WS]';

let wsClient = null;

/**
 * Inicia la conexión WebSocket y suscribe las órdenes del usuario.
 * @param {function} updateCallback - Función para enviar las órdenes actualizadas al servidor principal (app.js).
 */
function initOrderWebSocket(updateCallback) {
    if (wsClient) {
        console.log(`${LOG_PREFIX} Conexión ya activa.`);
        return;
    }

    wsClient = new WebSocket(WS_URL);

    wsClient.on('open', () => {
        console.log(`${LOG_PREFIX} Conexión exitosa. Suscribiendo a órdenes abiertas...`);
        // 🚨 IMPORTANTE: La suscripción de órdenes de usuario requiere autenticación (si es BitMart)
        // La API de BitMart para órdenes de usuario WS requiere un paso de login o suscripción
        // con tus credenciales. Debes reemplazar esto con el formato exacto de BitMart.

        // --- Suscripción de EJEMPLO (Formato común) ---
        const subscriptionMessage = {
            op: "subscribe",
            args: ["spot/user/order:BTC_USDT"] // Suscribe a órdenes de usuario (debes usar tu símbolo)
        };
        wsClient.send(JSON.stringify(subscriptionMessage));
        // Si BitMart requiere un 'login' o 'auth' previo, debe ir aquí.
    });

    wsClient.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            // 💡 Filtramos solo los mensajes de actualización de órdenes
            if (message.event === 'update' && message.topic.startsWith('spot/user/order')) {
                const orders = message.data; // Asume que 'message.data' es el array de órdenes

                // 🛑 CORRECCIÓN Y MEJORA: Filtramos en el backend para enviar solo órdenes ABIERTAS
                // (incluyendo el estado PENDING) para la tabla de órdenes abiertas.
                const openOrders = Array.isArray(orders) ? orders.filter(order => {
                    // Normalizamos el estado para la verificación
                    const state = String(order.state || order.status || '').toLowerCase().replace(/_/g, ' ');
                    
                    // Estados de órdenes que consideramos 'abiertas' en BitMart
                    const isOpen = state.includes('new') || 
                                   state.includes('partial') || 
                                   state.includes('open') || 
                                   state.includes('pending'); // <--- ¡Esta es la adición clave!

                    return isOpen;
                }) : [];


                console.log(`${LOG_PREFIX} Órdenes abiertas filtradas recibidas: ${openOrders.length}`);
                updateCallback(openOrders); // Enviamos solo las órdenes abiertas filtradas.
            }
            
            // Si BitMart usa un mecanismo de ping/pong, se debe manejar aquí para mantener viva la conexión
            if (message.event === 'ping') {
                wsClient.send(JSON.stringify({ event: 'pong' }));
            }
            
        } catch (error) {
            console.error(`${LOG_PREFIX} Error al procesar el mensaje WS:`, error.message);
        }
    });

    wsClient.on('error', (error) => {
        console.error(`${LOG_PREFIX} Error en el WebSocket:`, error.message);
    });

    wsClient.on('close', () => {
        console.log(`${LOG_PREFIX} Conexión cerrada. Intentando reconectar...`);
        wsClient = null; // Reinicia el cliente para permitir la reconexión
        setTimeout(() => initOrderWebSocket(updateCallback), 5000); // Reintenta en 5 segundos
    });
}

module.exports = {
    initOrderWebSocket
};