/**
 * BSB/server/services/orderSyncService.js
 * Sincronizador de Órdenes Abiertas (Espejo BitMart -> DB)
 * Refactorizado: Mapeo estricto de prefijos para pestañas 2026
 */
const Order = require('../models/Order');
const bitmartService = require('./bitmartService');

const syncOpenOrders = async (userId, credentials, io) => {
    // 🛡️ BLINDAJE DE SEGURIDAD
    if (!userId) return;
    
    try {
        // Aseguramos que el símbolo sea un string válido
        const symbol = 'BTC_USDT'; 
        
        // 1. Obtener órdenes abiertas reales desde BitMart
        const bitmartResponse = await bitmartService.getOpenOrders(symbol, credentials);
        const remoteOpenOrders = bitmartResponse.orders || [];

        // 2. Limpiar de nuestra DB local SOLO las que están activas para este usuario
        // Esto evita duplicados antes de re-insertar el estado actual de BitMart
        await Order.deleteMany({
            userId: userId.toString(),
            status: { $in: ['NEW', 'PENDING', 'PARTIALLY_FILLED', 'OPEN', 'ACTIVE'] }
        });

        // 3. Preparar las órdenes de BitMart para nuestra DB
        const ordersToInsert = remoteOpenOrders.map(bo => {
            let strategy = 'ex'; // Por defecto: externa/manual
            
            // Verificación del prefijo del bot (Client Order ID)
            const cId = bo.clientOrderId || "";
            
            // Mapeo exacto para las pestañas del Frontend
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

        // 5. Emitir al Frontend vía Socket (Sincronización en tiempo real)
        if (io) {
            const userIdStr = userId.toString();
            
            // Obtenemos historial reciente para refrescar la UI completa
            const updatedHistory = await Order.find({ userId: userIdStr })
                .sort({ orderTime: -1 })
                .limit(50)
                .lean();
            
            // Refresco de Historial (Pestaña All / History)
            io.to(userIdStr).emit('ai-history-update', updatedHistory);
            
            // Refresco de Órdenes Abiertas
            const openOnly = updatedHistory.filter(o => 
                ['NEW', 'PARTIALLY_FILLED', 'OPEN', 'ACTIVE'].includes(o.status)
            );
            io.to(userIdStr).emit('open-orders-update', openOnly);
        }

        if (ordersToInsert.length > 0) {
            console.log(`[SYNC] ✅ User ${userId}: ${ordersToInsert.length} órdenes sincronizadas.`);
        }
        
    } catch (error) {
        // Lanzamos error crítico de credenciales para que server.js detenga los motores
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            throw error; 
        }
        console.error(`❌ Error en syncOpenOrders para ${userId}:`, error.message);
    }
};

module.exports = { syncOpenOrders };