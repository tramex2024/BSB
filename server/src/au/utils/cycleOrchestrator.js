/**
 * BSB/server/src/au/utils/cycleOrchestrator.js
 * Soporte Multi-Usuario y Sincronización - Edición Unificada 2026
 * MODO SEGURO: Gestión de Bitmart para Real y DB para IA.
 */

const Autobot = require('../../../models/Autobot');
const User = require('../../../models/User'); 
const Order = require('../../../models/Order'); 
const bitmartService = require('../../../services/bitmartService');
const { decrypt } = require('../../../utils/encryption'); 

let io;
let lastCyclePrice = 0;

const orchestrator = {
    setIo: (socketIo) => { io = socketIo; orchestrator.io = socketIo; }, 
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
     * updateAIStateData: Interfaz segura para el motor de IA.
     * Solo escribe en DB, nunca toca Bitmart.
     */
    updateAIStateData: async (userId, changes) => {
        return await orchestrator.commitChanges(userId, changes, lastCyclePrice);
    },

    /**
     * commitChanges: Gestión atómica de la base de datos con sincronización de estado.
     * Ubicación: server/src/au/utils/cycleOrchestrator.js
     */
    commitChanges: async (userId, changeSet, currentPrice) => {
        if (!userId || !changeSet || Object.keys(changeSet).length === 0) return null;
        
        try {
            // Inicializamos la estructura de la consulta
            const updateQuery = { $set: {}, $inc: {} };
            
            // Distribuimos los cambios según el operador
            for (const key in changeSet) {
                if (key === '$inc') {
                    Object.assign(updateQuery.$inc, changeSet[key]);
                } else if (key.startsWith('$')) {
                    // Soporte para otros operadores (como $push o $unset)
                    updateQuery[key] = changeSet[key];
                } else {
                    // Por defecto es una actualización de campo ($set)
                    updateQuery.$set[key] = changeSet[key];
                }
            }

            // Limpieza: Eliminamos operadores vacíos para evitar errores de sintaxis en MongoDB
            if (Object.keys(updateQuery.$inc).length === 0) delete updateQuery.$inc;
            
            if (Object.keys(updateQuery.$set).length === 0) {
                delete updateQuery.$set;
            } else {
                // Si hay campos para actualizar, estampamos la fecha
                updateQuery.$set.lastUpdate = new Date();
            }

            // Ejecución atómica en MongoDB
            const updated = await Autobot.findOneAndUpdate(
                { userId }, 
                updateQuery, 
                { new: true, lean: true, runValidators: true }
            );

            if (updated) {
                // Sincronización asíncrona: No usamos 'await' aquí para que la DB 
                // responda rápido aunque el socket esté lento.
                orchestrator.syncFrontendState(currentPrice, updated, userId)
                    .catch(err => console.error(`[SYNC-EMIT-ERROR] User ${userId}:`, err.message));
                
                return updated;
            }
        } catch (error) {
            console.error(`[DB-ERROR] Crítico en commitChanges para User ${userId}:`, error.message);
        }
        return null;
    },

    /**
     * slowBalanceCacheUpdate: Sincronización de balances de Bitmart.
     * MANTIENE TU LÓGICA ORIGINAL DE SINCRONIZACIÓN REAL.
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