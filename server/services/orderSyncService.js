/**
 * BSB/server/services/orderSyncService.js
 * Sincronizador de Órdenes Abiertas (Espejo BitMart -> DB)
 */
const Order = require('../models/Order');
const bitmartService = require('./bitmartService');

const syncOpenOrders = async (userId, credentials, io) => {
    // 🛡️ BLINDAJE DE SEGURIDAD
    if (!userId) return;
    
    try {
        // Aseguramos que el símbolo sea un string válido para evitar el error .includes()
        const symbol = 'BTC_USDT'; 
        
        // 1. Obtener órdenes abiertas reales desde BitMart
        // El servicio ya tiene el fix para manejar el body vacío en V4
        const bitmartResponse = await bitmartService.getOpenOrders(symbol, credentials);
        const remoteOpenOrders = bitmartResponse.orders || [];

        // 2. Limpiar de nuestra DB local SOLO las que están NEW o PENDING para este usuario
        // Usamos userId.toString() para asegurar consistencia en la query
        await Order.deleteMany({
            userId: userId.toString(),
            status: { $in: ['NEW', 'PENDING', 'PARTIALLY_FILLED'] }
        });

        // 3. Preparar las órdenes de BitMart para nuestra DB
        const ordersToInsert = remoteOpenOrders.map(bo => {
            let strategy = 'ex'; // 'ex' para órdenes externas/manuales
            
            // Verificación segura del prefijo del bot
            const cId = bo.clientOrderId || "";
            if (cId.startsWith('L_')) strategy = 'long';
            else if (cId.startsWith('S_')) strategy = 'short';
            else if (cId.startsWith('AI_')) strategy = 'ai';

            return {
                userId: userId.toString(),
                orderId: bo.orderId,
                symbol: bo.symbol || symbol,
                side: (bo.side || 'buy').toUpperCase(),
                type: (bo.type || 'limit').toUpperCase(),
                price: parseFloat(bo.price || 0),
                size: parseFloat(bo.size || 0),
                filledSize: parseFloat(bo.filledSize || 0),
                status: (bo.status || 'NEW').toUpperCase(),
                strategy: strategy,
                orderTime: new Date(parseInt(bo.updateTime || Date.now())),
                cycleIndex: 0 
            };
        });

        // 4. Insertar las órdenes frescas
        if (ordersToInsert.length > 0) {
            await Order.insertMany(ordersToInsert);
        }

        // 5. Emitir al Frontend vía Socket
        if (io) {
            const userIdStr = userId.toString();
            
            // Obtenemos historial reciente para refrescar la UI completa
            const updatedHistory = await Order.find({ userId: userIdStr })
                .sort({ orderTime: -1 })
                .limit(50)
                .lean();
            
            io.to(userIdStr).emit('ai-history-update', updatedHistory);
            
            const openOnly = updatedHistory.filter(o => 
                ['NEW', 'PARTIALLY_FILLED'].includes(o.status)
            );
            io.to(userIdStr).emit('open-orders-update', openOnly);
        }

        if (ordersToInsert.length > 0) {
            console.log(`Sync [${userId}]: ${ordersToInsert.length} órdenes abiertas detectadas.`);
        }
        
    } catch (error) {
        // Si el error es 401, lo lanzamos hacia arriba para que server.js 
        // active el "freno de mano" y bloquee al usuario.
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            throw error; 
        }
        console.error(`❌ Error en syncOpenOrders para ${userId}:`, error.message);
    }
};

module.exports = { syncOpenOrders };