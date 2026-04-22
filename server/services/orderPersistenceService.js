/**
 * BSB/server/services/orderPersistenceService.js
 * ORDER PERSISTENCE AND NOTIFICATION (Multi-user)
 */

const Order = require('../models/Order');

// Variable to store the Socket.io instance
let ioInstance = null;

function setIo(io) {
    ioInstance = io;
}

/**
 * Saves the order linked to a user and notifies in real-time.
 * @param {Object} orderDetails - Data from BitMart
 * @param {String} strategy - 'long', 'short', or 'ai'
 * @param {String} userId - ID of the owner user
 * @param {Number} currentCycle - The current cycle of the bot
 */
async function saveExecutedOrder(orderDetails, strategy, userId, currentCycle = 0) {
    try {
        if (!userId) {
            console.error(`[PERSISTENCE ERROR] No userId provided.`);
            return null;
        }

        const rawTime = orderDetails.orderTime || orderDetails.create_time || Date.now();
        const validOrderDate = new Date(Number(rawTime));

        // IMPROVED CALCULATION: Ensure we don't save 0 in notional
        const size = parseFloat(orderDetails.size || orderDetails.filledSize || 0);
        const price = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        
        // If the API doesn't provide notional, we calculate it ourselves
        const calculatedNotional = parseFloat(orderDetails.notional) || (size * price);

        // 1. DATABASE CREATION
        const newOrder = await Order.create({
            userId: userId, 
            strategy: strategy.toLowerCase(), // Normalize to lowercase
            cycleIndex: currentCycle, 
            orderId: orderDetails.orderId || orderDetails.order_id, 
            symbol: orderDetails.symbol || 'BTC_USDT',
            side: (orderDetails.side || '').toUpperCase(),
            type: (orderDetails.type || 'MARKET').toUpperCase(),
            size: size,
            price: price,
            notional: calculatedNotional,
            fee: parseFloat(orderDetails.fee || (calculatedNotional * 0.001)), // Estimated fee if missing
            status: 'FILLED', 
            orderTime: validOrderDate
        });

        // 2. NOTIFICATION
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
        // Handle duplicates (BitMart sometimes sends the same event twice)
        if (error.code === 11000) {
            console.warn(`[PERSISTENCE] Duplicate order ${orderDetails.orderId || orderDetails.order_id}. No action required.`);
            return null;
        }
        console.error(`[PERSISTENCE ERROR] Critical error while saving: ${error.message}`);
        return null;
    }
}

module.exports = { 
    saveExecutedOrder,
    setIo 
};