/**
 * BSB/server/services/orderSyncService.js
 * Sincronizador de Órdenes Abiertas (Espejo BitMart -> DB)
 */
const Order = require('../models/Order');
const bitmartService = require('./bitmartService');

const syncOpenOrders = async (userId, credentials, io) => {
    try {
        const symbol = 'BTC_USDT';
        
        // 1. Obtener órdenes abiertas reales desde BitMart
        const bitmartResponse = await bitmartService.getOpenOrders(symbol, credentials);
        const remoteOpenOrders = bitmartResponse.orders || [];

        // 2. Limpiar de nuestra DB local SOLO las que están NEW o PENDING para este usuario
        // Esto evita duplicados y elimina las que ya se cerraron o cancelaron en el exchange
        await Order.deleteMany({
            userId: userId,
            status: { $in: ['NEW', 'PENDING', 'PARTIALLY_FILLED'] }
        });

        // 3. Preparar las órdenes de BitMart para nuestra DB
        const ordersToInsert = remoteOpenOrders.map(bo => {
            // Lógica de Identificación de Estrategia:
            // Si el clientOrderId no existe o no tiene el prefijo de tu bot, es 'EX'
            let strategy = 'ex'; 
            
            // Ejemplo: si tus bots usan prefijos como "L_" para Long o "S_" para Short
            if (bo.clientOrderId) {
                if (bo.clientOrderId.startsWith('L_')) strategy = 'long';
                else if (bo.clientOrderId.startsWith('S_')) strategy = 'short';
                else if (bo.clientOrderId.startsWith('AI_')) strategy = 'ai';
            }

            return {
                userId: userId,
                orderId: bo.orderId,
                symbol: bo.symbol,
                side: bo.side.toUpperCase(),
                type: bo.type.toUpperCase(),
                price: parseFloat(bo.price || 0),
                size: parseFloat(bo.size || 0),
                filledSize: parseFloat(bo.filledSize || 0),
                status: bo.status.toUpperCase(),
                strategy: strategy, // <--- Aquí aplicamos tu idea del 'ex'
                orderTime: new Date(parseInt(bo.updateTime || Date.now())),
                cycleIndex: 0 // Por defecto para órdenes manuales
            };
        });

        // 4. Insertar las órdenes frescas si hay alguna
        if (ordersToInsert.length > 0) {
            await Order.insertMany(ordersToInsert);
        }

        // 5. Emitir al Frontend vía Socket para actualización instantánea
        if (io) {
            const allOrders = await Order.find({ userId }).sort({ orderTime: -1 }).limit(50);
            io.to(userId.toString()).emit('ai-history-update', allOrders);
        }

        console.log(`Sync [${userId}]: ${ordersToInsert.length} órdenes abiertas sincronizadas (Status: EX para manuales).`);
        
    } catch (error) {
        console.error(`❌ Error en syncOpenOrders para ${userId}:`, error.message);
    }
};

module.exports = { syncOpenOrders };