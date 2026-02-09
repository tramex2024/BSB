/**
 * BSB/server/services/orderPersistenceService.js
 * PERSISTENCIA Y NOTIFICACIÓN DE ÓRDENES (Multi-usuario)
 */

const Order = require('../models/Order');

// Variable para guardar la instancia de Socket.io
let ioInstance = null;

function setIo(io) {
    ioInstance = io;
}

/**
 * Guarda la orden vinculándola a un usuario y notifica en tiempo real.
 * @param {Object} orderDetails - Datos de BitMart
 * @param {String} strategy - 'long', 'short' o 'ai'
 * @param {String} userId - ID del usuario dueño
 * @param {Number} currentCycle - El ciclo actual del bot (AÑADIDO)
 */
async function saveExecutedOrder(orderDetails, strategy, userId, currentCycle = 0) {
    try {
        if (!userId) {
            console.error(`[PERSISTENCE ERROR] No userId provided.`);
            return null;
        }

        const rawTime = orderDetails.orderTime || orderDetails.create_time || Date.now();
        const validOrderDate = new Date(Number(rawTime));

        // 1. CREACIÓN EN BASE DE DATOS
        const newOrder = await Order.create({
            userId: userId, 
            strategy: strategy.toLowerCase(), // Normalizamos a minúsculas
            cycleIndex: currentCycle, // <--- AHORA SÍ CUMPLE CON EL SCHEMA
            orderId: orderDetails.orderId || orderDetails.order_id, 
            symbol: orderDetails.symbol || 'BTC_USDT',
            side: orderDetails.side.toUpperCase(),
            type: (orderDetails.type || 'MARKET').toUpperCase(),
            size: parseFloat(orderDetails.size || 0),
            price: parseFloat(orderDetails.priceAvg || orderDetails.price || 0),
            notional: parseFloat(orderDetails.notional || (orderDetails.size * (orderDetails.price || 0))),
            status: 'FILLED', 
            orderTime: validOrderDate
        });

        // 2. NOTIFICACIÓN (Asegúrate de usar la sala sin el prefijo 'user_')
        if (newOrder && ioInstance) {
            const userRoom = userId.toString(); 
            ioInstance.to(userRoom).emit('new-order-executed', { strategy, order: newOrder });

            const updatedHistory = await Order.find({ userId: userId })
                .sort({ orderTime: -1 })
                .limit(20)
                .lean();
            
            ioInstance.to(userRoom).emit('ai-history-update', updatedHistory);
        }

        return newOrder;

    } catch (error) {
        // Manejo de duplicados (BitMart a veces envía el mismo evento 2 veces)
        if (error.code === 11000) {
            console.warn(`[PERSISTENCE] Orden duplicada ${orderDetails.orderId}. No se requiere acción.`);
            return null;
        }
        console.error(`[PERSISTENCE ERROR] Error crítico al guardar: ${error.message}`);
        return null;
    }
}

module.exports = { 
    saveExecutedOrder,
    setIo 
};