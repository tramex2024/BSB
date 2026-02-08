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
 */
async function saveExecutedOrder(orderDetails, strategy, userId) {
    try {
        if (!userId) {
            console.error(`[PERSISTENCE ERROR] Intento de guardar orden sin userId.`);
            return null;
        }

        const rawTime = orderDetails.orderTime || orderDetails.create_time || orderDetails.update_time || Date.now();
        const validOrderDate = new Date(Number(rawTime));

        // 1. CREACIÓN EN BASE DE DATOS
        const newOrder = await Order.create({
            userId: userId, 
            orderId: orderDetails.orderId || orderDetails.order_id, 
            symbol: orderDetails.symbol || 'BTC_USDT',
            side: orderDetails.side,
            type: orderDetails.type || 'market',
            size: parseFloat(orderDetails.size || 0),
            notional: parseFloat(orderDetails.notional || 0),
            price: parseFloat(orderDetails.priceAvg || orderDetails.price || 0),
            filledSize: parseFloat(orderDetails.filledSize || orderDetails.size || 0),
            status: 'Filled', 
            orderTime: validOrderDate,
            strategy: strategy 
        });

        // 2. NOTIFICACIÓN PRIVADA VÍA SOCKET.IO
        if (newOrder && ioInstance) {
            // Importante: Usar el prefijo 'user_' para coincidir con autobotLogic y server.js
            const userRoom = `user_${userId}`;
            
            console.log(`[PERSISTENCE] 📢 Notificando orden ${newOrder.orderId} (${strategy}) al canal ${userRoom}.`);
            
            // Emitimos el evento de ejecución individual
            ioInstance.to(userRoom).emit('new-order-executed', {
                strategy: strategy,
                order: newOrder
            });

            // Enviamos el historial actualizado de los últimos 20 movimientos de ESTE usuario
            const updatedHistory = await Order.find({ userId: userId })
                .sort({ orderTime: -1 })
                .limit(20)
                .lean(); // .lean() para que la respuesta sea un objeto JS plano más rápido
            
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