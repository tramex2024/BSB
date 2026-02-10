/**
 * BSB/server/src/au/utils/cycleOrchestrator.js
 * Herramientas de soporte para el ciclo de ejecución multi-usuario.
 */

const Autobot = require('../../../models/Autobot');
const bitmartService = require('../../../services/bitmartService');

let io;
let lastCyclePrice = 0;

const orchestrator = {
    setIo: (socketIo) => { io = socketIo; },
    setLastPrice: (price) => { lastCyclePrice = price; },
    getLastPrice: () => lastCyclePrice,

    log: (message, type = 'info', userId = null) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [${type.toUpperCase()}] ${userId ? `[User: ${userId}] ` : ''}${message}`);
        if (io) {
            if (userId) {
                io.to(userId.toString()).emit('bot-log', { message, type });
            } else {
                io.emit('bot-log', { message, type });
            }
        }
    },

    syncFrontendState: async (currentPrice, botState, userId) => {
        if (io && botState && userId) {
            const priceToEmit = parseFloat(currentPrice || lastCyclePrice || 0);
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
            const balancesArray = await bitmartService.getBalance(userId);
            const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
            const btcBalance = balancesArray.find(b => b.currency === 'BTC');
            availableUSDT = parseFloat(usdtBalance?.available || 0);
            availableBTC = parseFloat(btcBalance?.available || 0);
            apiSuccess = true;
        } catch (error) {
            const current = await Autobot.findOne({ userId }).lean();
            availableUSDT = current?.lastAvailableUSDT || 0;
            availableBTC = current?.lastAvailableBTC || 0;
        }
        
        const updated = await Autobot.findOneAndUpdate({ userId }, {
            $set: { lastAvailableUSDT: availableUSDT, lastAvailableBTC: availableBTC, lastBalanceCheck: new Date() }
        }, { new: true, upsert: true, lean: true });

        if (updated) await orchestrator.syncFrontendState(lastCyclePrice, updated, userId);
        return apiSuccess;
    }
};

module.exports = orchestrator;