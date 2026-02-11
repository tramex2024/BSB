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
    setLastPrice: (price) => { lastCyclePrice = parseFloat(price); }, // Forzamos float
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
            // Prioridad absoluta al precio que viene del ticker
            const priceToEmit = parseFloat(currentPrice) || lastCyclePrice || 0;
            
            io.to(userId.toString()).emit('bot-state-update', { 
                ...botState, 
                price: priceToEmit,
                serverTime: Date.now() 
            });
        }
    },

    commitChanges: async (userId, changeSet, currentPrice) => {
        // Ahora permitimos que se guarde siempre gracias al lastUpdate que añadimos en autobotLogic
        if (!userId || Object.keys(changeSet).length === 0) return null;
        
        try {
            changeSet.lastUpdate = new Date();
            const updated = await Autobot.findOneAndUpdate(
                { userId }, 
                { $set: changeSet }, 
                { new: true, lean: true }
            );
            if (updated) {
                // Pasamos el currentPrice explícito para evitar desfases
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
            if (!balancesArray || !Array.isArray(balancesArray)) throw new Error("Balance vacío");

            const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
            const btcBalance = balancesArray.find(b => b.currency === 'BTC');
            
            availableUSDT = parseFloat(usdtBalance?.available || 0);
            availableBTC = parseFloat(btcBalance?.available || 0);
            apiSuccess = true;
        } catch (error) {
            // Si falla la API, no hacemos nada para no pisar datos con ceros
            console.error(`[BALANCE-FETCH-ERROR] ${userId}: ${error.message}`);
            return false;
        }
        
        // ACTUALIZACIÓN SILENCIOSA: 
        // Solo actualizamos balance sin emitir estado completo inmediatamente
        // para dejar que el ciclo principal del bot (el tick) sea el que mande los precios.
        const updated = await Autobot.findOneAndUpdate({ userId }, {
            $set: { 
                lastAvailableUSDT: availableUSDT, 
                lastAvailableBTC: availableBTC, 
                lastBalanceCheck: new Date() 
            }
        }, { new: true, lean: true });

        // Solo sincronizamos si el bot está detenido. 
        // Si está corriendo, el botCycle se encargará de emitir los datos frescos en el siguiente tick.
        if (updated && (updated.lstate === 'STOPPED' && updated.sstate === 'STOPPED')) {
            await orchestrator.syncFrontendState(lastCyclePrice, updated, userId);
        }
        
        return apiSuccess;
    }
};

module.exports = orchestrator;