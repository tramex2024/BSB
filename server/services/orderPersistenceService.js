// services/orderPersistenceService.js

const Order = require('../models/Order');

async function saveExecutedOrder(orderDetails, strategy) {
    try {
        const newOrder = await Order.create({
            orderId: orderDetails.orderId, // Asumimos que el consolidador mapea a orderId
            symbol: orderDetails.symbol,
            side: orderDetails.side,
            type: orderDetails.type,
            size: parseFloat(orderDetails.size || 0),
            notional: parseFloat(orderDetails.notional || 0),
            price: parseFloat(orderDetails.priceAvg || orderDetails.price || 0), // Usar precio avg o precio límite
            filledSize: parseFloat(orderDetails.filledSize || 0),
            status: 'Filled', // Asumimos que esta función solo recibe órdenes llenadas
            orderTime: new Date(orderDetails.orderTime),
            strategy: strategy // 🛑 CAMPO CLAVE
        });
        return newOrder;
    } catch (error) {
        console.error(`[PERSISTENCE ERROR] Error al guardar la orden ejecutada: ${error.message}`);
        // Loggear o manejar el error (ej: si el orderId ya existe)
        return null;
    }
}
module.exports = { saveExecutedOrder };