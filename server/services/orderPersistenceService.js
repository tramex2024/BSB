// services/orderPersistenceService.js

const Order = require('../models/Order');

async function saveExecutedOrder(orderDetails, strategy) {
    try {
        // 🛠️ NORMALIZACIÓN DEL TIEMPO:
        // Intentamos obtener el tiempo de varios campos posibles que envía BitMart
        const rawTime = orderDetails.orderTime || orderDetails.create_time || orderDetails.update_time || Date.now();
        
        // Convertimos a número para asegurar que new Date() lo interprete como timestamp
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
            orderTime: validOrderDate, // ✅ Ahora es un objeto Date garantizado
            strategy: strategy 
        });

        return newOrder;
    } catch (error) {
        // Si el error es por duplicado (código 11000), devolvemos el error amigablemente
        if (error.code === 11000) {
            console.warn(`[PERSISTENCE] La orden ${orderDetails.orderId} ya existe en la DB. Saltando.`);
            return null;
        }
        
        console.error(`[PERSISTENCE ERROR] Error al guardar la orden ejecutada: ${error.message}`);
        return null;
    }
}

module.exports = { saveExecutedOrder };