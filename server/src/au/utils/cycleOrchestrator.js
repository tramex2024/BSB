/**
 * BSB/server/src/au/utils/cycleOrchestrator.js
 * Herramientas de soporte para el ciclo de ejecución multi-usuario y sincronización de Exchange.
 */

const Autobot = require('../../../models/Autobot');
const User = require('../../../models/User'); 
const Order = require('../../../models/Order'); 
const bitmartService = require('../../../services/bitmartService');
const { decrypt } = require('../../../utils/encryption'); 

let io;
let lastCyclePrice = 0;

const orchestrator = {
    setIo: (socketIo) => { io = socketIo; },
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

    /**
     * Sincroniza el estado del bot con el frontend de forma segura.
     */
    syncFrontendState: async (currentPrice, botState, userId) => {
        if (io && botState && userId) {
            const priceToEmit = parseFloat(currentPrice) || lastCyclePrice || 0;
            
            // BLINDAJE: Nos aseguramos de emitir una estructura limpia
            io.to(userId.toString()).emit('bot-state-update', { 
                ...botState, 
                price: priceToEmit,
                serverTime: Date.now() 
            });
        }
    },

    commitChanges: async (userId, changeSet, currentPrice) => {
        if (!userId || Object.keys(changeSet).length === 0) return null;
        
        try {
            changeSet.lastUpdate = new Date();
            const updated = await Autobot.findOneAndUpdate(
                { userId }, 
                { $set: changeSet }, 
                { new: true, lean: true }
            );
            if (updated) {
                // Emitimos la actualización real tras el cambio en base de datos
                await orchestrator.syncFrontendState(currentPrice, updated, userId);
                return updated;
            }
        } catch (error) {
            console.error(`[DB-ERROR] User ${userId}: ${error.message}`);
        }
        return null;
    },

    /**
     * SINCRONIZACIÓN MAESTRA DE BALANCE Y ÓRDENES
     */
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
                const ordersToSave = bitmartOrders.map(o => {
                    const rawStatus = String(o.status || '').toLowerCase();
                    let finalStatus = 'PENDING'; 
                    if (['6', 'filled', 'fully_filled'].includes(rawStatus)) finalStatus = 'FILLED';
                    else if (['7', 'canceled', 'cancelled'].includes(rawStatus)) finalStatus = 'CANCELED';

                    return {
                        userId,
                        strategy: 'ex',
                        cycleIndex: 0,
                        executionMode: 'REAL',
                        orderId: o.orderId || o.order_id,
                        symbol: o.symbol || 'BTC_USDT',
                        side: (o.side || 'BUY').toUpperCase(),
                        type: (o.type || 'LIMIT').toUpperCase(),
                        size: parseFloat(o.size || 0),
                        price: parseFloat(o.price || 0),
                        status: finalStatus,
                        orderTime: new Date(parseInt(o.create_time || Date.now()))
                    };
                });
                await Order.insertMany(ordersToSave);
            }

            // Actualización del balance en el documento del Bot
            const updated = await Autobot.findOneAndUpdate({ userId }, {
                $set: { 
                    lastAvailableUSDT: availableUSDT, 
                    lastAvailableBTC: availableBTC, 
                    lastBalanceCheck: new Date() 
                }
            }, { new: true, lean: true });

            // CAMBIO CRÍTICO: Sincronizamos SIEMPRE que haya una actualización exitosa, 
            // no solo cuando está STOPPED, para que el frontend tenga el balance real.
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