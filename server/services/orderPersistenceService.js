// services/orderPersistenceService.js

const Order = require('../models/Order');

// Variable para guardar la instancia de Socket.io (se inyectará desde el server o logic)
let ioInstance = null;

function setIo(io) {
    ioInstance = io;
}

async function saveExecutedOrder(orderDetails, strategy) {
    try {
        const rawTime = orderDetails.orderTime || orderDetails.create_time || orderDetails.update_time || Date.now();
        const validOrderDate = new Date(Number(rawTime));

        const newOrder = await Order.create({
            orderId: orderDetails.orderId || orderDetails.order_id, 
            symbol: orderDetails.symbol,
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

        // ✅ CIRUGÍA EXITOSA: Si la orden se guardó y tenemos Socket.io, avisamos al Frontend
        if (newOrder && ioInstance) {
            console.log(`[PERSISTENCE] 📢 Notificando nueva orden (${strategy}) al frontend.`);
            
            // Emitimos a todos los clientes que deben actualizar su historial
            ioInstance.emit('new-order-executed', {
                strategy: strategy,
                order: newOrder
            });

            // También podemos enviar el historial actualizado de los últimos 20
            const updatedHistory = await Order.find({})
                .sort({ orderTime: -1 })
                .limit(20);
            ioInstance.emit('ai-history-update', updatedHistory);
        }

        return newOrder;
    } catch (error) {
        if (error.code === 11000) {
            console.warn(`[PERSISTENCE] La orden ${orderDetails.orderId} ya existe en la DB. Saltando.`);
            return null;
        }
        console.error(`[PERSISTENCE ERROR] Error al guardar la orden ejecutada: ${error.message}`);
        return null;
    }
}

module.exports = { 
    saveExecutedOrder,
    setIo // Exportamos el inyector
};