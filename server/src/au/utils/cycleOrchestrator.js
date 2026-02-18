/**
 * BSB/server/src/au/utils/cycleOrchestrator.js
 * Soporte Multi-Usuario y Sincronización - Edición Unificada 2026
 */

const Autobot = require('../../../models/Autobot');
const User = require('../../../models/User'); 
const Order = require('../../../models/Order'); 
const bitmartService = require('../../../services/bitmartService');
const { decrypt } = require('../../../utils/encryption'); 

let io;
let lastCyclePrice = 0;

const orchestrator = {
    setIo: (socketIo) => { io = socketIo; orchestrator.io = socketIo; }, // Aseguramos acceso interno
    setLastPrice: (price) => { lastCyclePrice = parseFloat(price); },
    getLastPrice: () => lastCyclePrice,

    log: (message, type = 'info', userId = null) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [${type.toUpperCase()}] ${userId ? `[User: ${userId}] ` : ''}${message}`);
        
        if (io) {
            const room = userId ? userId.toString() : null;
            if (room) {
                io.to(room).emit('bot-log', { message, type });
            } else {
                io.emit('bot-log', { message, type });
            }
        }
    },

    syncFrontendState: async (currentPrice, botState, userId) => {
        if (io && botState && userId) {
            const priceToEmit = parseFloat(currentPrice) || lastCyclePrice || 0;
            io.to(userId.toString()).emit('bot-state-update', { 
                ...botState, 
                price: priceToEmit,
                serverTime: Date.now() 
            });
        }
    },

    /**
     * commitChanges: Ahora soporta $inc para beneficios de la IA y $set para estados.
     */
    commitChanges: async (userId, changeSet, currentPrice) => {
        if (!userId || Object.keys(changeSet).length === 0) return null;
        
        try {
            const updateQuery = { $set: {}, $inc: {} };
            
            // Separamos lo que es incremento (profit) de lo que es estado (set)
            for (const key in changeSet) {
                if (key === '$inc') {
                    Object.assign(updateQuery.$inc, changeSet[key]);
                } else {
                    updateQuery.$set[key] = changeSet[key];
                }
            }

            // Si no hay incrementos, eliminamos la propiedad para evitar errores de MongoDB
            if (Object.keys(updateQuery.$inc).length === 0) delete updateQuery.$inc;
            updateQuery.$set.lastUpdate = new Date();

            const updated = await Autobot.findOneAndUpdate(
                { userId }, 
                updateQuery, 
                { new: true, lean: true }
            );

            if (updated) {
                await orchestrator.syncFrontendState(currentPrice, updated, userId);
                return updated;
            }
        } catch (error) {
            console.error(`[DB-ERROR] User ${userId}: ${error.message}`);
        }
        return null;
    },

    slowBalanceCacheUpdate: async (userId) => {
        let availableUSDT = 0, availableBTC = 0, apiSuccess = false;
        
        try {
            const user = await User.findById(userId).lean();
            if (!user || !user.bitmartApiKey) return false;

            const userCreds = {
                apiKey: decrypt(user.bitmartApiKey),
                secretKey: decrypt(user.bitmartSecretKeyEncrypted),
                apiMemo: decrypt(user.bitmartApiMemo)
            };

            const [balancesArray, openOrdersRes] = await Promise.all([
                bitmartService.getBalance(userCreds),
                bitmartService.getOpenOrders(null, userCreds) 
            ]);

            if (balancesArray && Array.isArray(balancesArray)) {
                const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
                const btcBalance = balancesArray.find(b => b.currency === 'BTC');
                availableUSDT = parseFloat(usdtBalance?.available || 0);
                availableBTC = parseFloat(btcBalance?.available || 0);
                apiSuccess = true;
            }

            // Sincronización de órdenes externas ('ex')
            await Order.deleteMany({ userId, strategy: 'ex' });
            const bitmartOrders = openOrdersRes?.orders || [];
            if (bitmartOrders.length > 0) {
                const ordersToSave = bitmartOrders.map(o => ({
                    userId,
                    strategy: 'ex',
                    executionMode: 'REAL',
                    orderId: o.orderId || o.order_id,
                    symbol: o.symbol || 'BTC_USDT',
                    side: (o.side || 'BUY').toUpperCase(),
                    type: (o.type || 'LIMIT').toUpperCase(),
                    size: parseFloat(o.size || 0),
                    price: parseFloat(o.price || 0),
                    status: ['6', 'filled', 'fully_filled'].includes(String(o.status).toLowerCase()) ? 'FILLED' : 'PENDING',
                    orderTime: new Date(parseInt(o.create_time || Date.now()))
                }));
                await Order.insertMany(ordersToSave);
            }

            const updated = await Autobot.findOneAndUpdate({ userId }, {
                $set: { 
                    lastAvailableUSDT: availableUSDT, 
                    lastAvailableBTC: availableBTC, 
                    lastBalanceCheck: new Date() 
                }
            }, { new: true, lean: true });

            if (updated) {
                await orchestrator.syncFrontendState(lastCyclePrice, updated, userId);
            }

        } catch (error) {
            console.error(`[SYNC-FETCH-ERROR] ${userId}: ${error.message}`);
            return false;
        }
        return apiSuccess;
    }
};

module.exports = orchestrator;