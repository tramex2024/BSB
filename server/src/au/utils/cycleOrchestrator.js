/**
 * BSB/server/src/au/utils/cycleOrchestrator.js
 * Herramientas de soporte para el ciclo de ejecución multi-usuario y sincronización de Exchange.
 */

const Autobot = require('../../../models/Autobot');
const User = require('../../../models/User'); // Importado para rescatar API Keys
const Order = require('../../../models/Order'); // Modelo para el espejo de órdenes
const bitmartService = require('../../../services/bitmartService');
const { decrypt } = require('../../../utils/encryption'); 

let io;
let lastCyclePrice = 0;

const orchestrator = {
    /**
     * Configura la instancia de Socket.io
     */
    setIo: (socketIo) => { io = socketIo; },

    /**
     * Actualiza y recupera el último precio conocido del mercado
     */
    setLastPrice: (price) => { lastCyclePrice = parseFloat(price); },
    getLastPrice: () => lastCyclePrice,

    /**
     * Sistema de logs centralizado con emisión a salas de Socket.io por userId
     */
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
     * Sincroniza el estado del bot y el precio actual con el frontend
     */
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
     * Guarda cambios en MongoDB y dispara la actualización al frontend
     */
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
                await orchestrator.syncFrontendState(currentPrice, updated, userId);
                return updated;
            }
        } catch (error) {
            console.error(`[DB-ERROR] User ${userId}: ${error.message}`);
        }
        return null;
    },

    /**
     * SINCRONIZACIÓN MAESTRA (Saldos + Órdenes de Exchange)
     */
    slowBalanceCacheUpdate: async (userId) => {
        let availableUSDT = 0, availableBTC = 0, apiSuccess = false;
        
        try {
            // 1. Buscamos al usuario para obtener llaves cifradas
            const user = await User.findById(userId).lean();
            if (!user || !user.bitmartApiKey || !user.bitmartSecretKeyEncrypted) {
                orchestrator.log("No se pudieron obtener las API Keys del usuario para sincronizar.", "error", userId);
                return false;
            }

            // 2. Desciframos para BitMart con los nombres EXACTOS del bitmartService.js
            const userCreds = {
                apiKey: decrypt(user.bitmartApiKey),
                secretKey: decrypt(user.bitmartSecretKeyEncrypted), // <--- ANTES DECÍA apiSecret (ERROR)
                apiMemo: decrypt(user.bitmartApiMemo)
            };

            // 3. Petición paralela a BitMart
            const [balancesArray, openOrdersRes] = await Promise.all([
                bitmartService.getBalance(userCreds),
                bitmartService.getOpenOrders(null, userCreds) 
            ]);

            // 4. Procesar Balances
            if (balancesArray && Array.isArray(balancesArray)) {
                const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
                const btcBalance = balancesArray.find(b => b.currency === 'BTC');
                
                availableUSDT = parseFloat(usdtBalance?.available || 0);
                availableBTC = parseFloat(btcBalance?.available || 0);
                apiSuccess = true;
            }

            // 5. Sincronizar Órdenes Abiertas (Estrategia: 'ex')
            await Order.deleteMany({ userId, strategy: 'ex' });

            const bitmartOrders = openOrdersRes?.orders || [];
            if (bitmartOrders.length > 0) {
                const ordersToSave = bitmartOrders.map(o => {
                    const rawStatus = (o.status || '').toString().toLowerCase();
                    const isPending = ['new', '8', 'pending', 'partially_filled', 'open'].includes(rawStatus);

                    return {
                        userId,
                        strategy: 'ex',
                        cycleIndex: 0,
                        executionMode: 'REAL',
                        orderId: o.orderId || o.order_id,
                        symbol: o.symbol || 'BTC_USDT',
                        side: (o.side || 'BUY').toUpperCase(),
                        type: (o.type || 'LIMIT').toUpperCase(),
                        size: parseFloat(o.size || o.amount || 0),
                        price: parseFloat(o.price || 0),
                        notional: parseFloat(o.notional || (parseFloat(o.size || 0) * parseFloat(o.price || 0)) || 0),
                        status: isPending ? 'PENDING' : 'FILLED',
                        orderTime: new Date(parseInt(o.create_time || o.order_time || Date.now()))
                    };
                });

                await Order.insertMany(ordersToSave);
            }

            // 6. Actualizar documento del Bot
            const updated = await Autobot.findOneAndUpdate({ userId }, {
                $set: { 
                    lastAvailableUSDT: availableUSDT, 
                    lastAvailableBTC: availableBTC, 
                    lastBalanceCheck: new Date() 
                }
            }, { new: true, lean: true });

            if (updated && (updated.lstate === 'STOPPED' && updated.sstate === 'STOPPED')) {
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