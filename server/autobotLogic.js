//BSB/server/autobotLogic.js

/**
 * Archivo: BSB/server/autobotLogic.js
 * Versión: BSB 2026 - Motor de Ciclos Unificado (Multi-usuario) - REPARADO
 */

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
// Eliminamos las importaciones de setDependencies que causaban el error
const { runLongStrategy } = require('./src/longStrategy');
const { runShortStrategy } = require('./src/shortStrategy');
const { runAIStrategy } = require('./src/aiStrategy'); 
const { CLEAN_LONG_ROOT, CLEAN_SHORT_ROOT } = require('./src/au/utils/cleanState');

const { 
    calculateLongCoverage, 
    calculateShortCoverage, 
    parseNumber, 
    calculatePotentialProfit 
} = require('./autobotCalculations');

// Monitores de órdenes
const { monitorAndConsolidate: monitorLongBuy } = require('./src/au/states/long/LongBuyConsolidator');
const { monitorAndConsolidateSell: monitorLongSell } = require('./src/au/states/long/LongSellConsolidator'); 
const { monitorAndConsolidateShort: monitorShortSell } = require('./src/au/states/short/ShortSellConsolidator');
const { monitorAndConsolidateShortBuy: monitorShortBuy } = require('./src/au/states/short/ShortBuyConsolidator');

let io;
let isProcessing = false; 
let lastCyclePrice = 0; 

/**
 * CONFIGURACIÓN DE SOCKETS
 */
function setIo(socketIo) { 
    io = socketIo; 
}

function getLastPrice() { 
    return lastCyclePrice; 
}

/**
 * SISTEMA DE LOGS PRIVADOS
 */
function log(message, type = 'info', userId = null) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [${type.toUpperCase()}] ${userId ? `[User: ${userId}] ` : ''}${message}`);
    if (io) {
        if (userId) {
            io.to(`user_${userId}`).emit('bot-log', { message, type });
        } else {
            io.emit('bot-log', { message, type });
        }
    }
}

/**
 * SINCRONIZACIÓN FRONTEND
 */
async function syncFrontendState(currentPrice, botState, userId) {
    if (io && botState && userId) {
        const priceToEmit = parseFloat(currentPrice || lastCyclePrice || 0);
        io.to(`user_${userId}`).emit('bot-state-update', { 
            ...botState, 
            price: priceToEmit,
            serverTime: Date.now() 
        });
    }
}

/**
 * PERSISTENCIA DE CAMBIOS (COMMIT)
 */
async function commitChanges(userId, changeSet, currentPrice) {
    if (!userId || Object.keys(changeSet).length === 0) return null;

    try {
        changeSet.lastUpdate = new Date();
        
        const updated = await Autobot.findOneAndUpdate(
            { userId }, 
            { $set: changeSet }, 
            { new: true, lean: true }
        );

        if (updated) {
            await syncFrontendState(currentPrice, updated, userId);
            return updated;
        }
    } catch (error) {
        console.error(`[DB-ERROR] User ${userId}: ${error.message}`);
    }
    return null;
}

/**
 * ACTUALIZACIÓN DE SALDOS REALES
 */
async function slowBalanceCacheUpdate(userId) {
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

    if (updated) await syncFrontendState(lastCyclePrice, updated, userId);
    return apiSuccess;
}

/**
 * GESTIÓN DE CONFIGURACIÓN
 */
async function updateConfig(userId, newConfig) {
    const currentPrice = lastCyclePrice;
    const currentBot = await Autobot.findOne({ userId }).lean();
    if (!currentBot) return null;

    const finalConfig = JSON.parse(JSON.stringify(currentBot.config || {}));

    const mergeSide = (side) => {
        if (newConfig[side]) {
            if (!finalConfig[side]) finalConfig[side] = {};
            for (const key in newConfig[side]) {
                const val = newConfig[side][key];
                if (val !== undefined && val !== null && val !== "") {
                    finalConfig[side][key] = val;
                }
            }
        }
    };

    mergeSide('long');
    mergeSide('short');
    if (newConfig.ai) {
        if (!finalConfig.ai) finalConfig.ai = {};
        Object.assign(finalConfig.ai, newConfig.ai);
    }
    if (newConfig.symbol) finalConfig.symbol = newConfig.symbol;

    const bot = await Autobot.findOneAndUpdate({ userId }, { 
        $set: { config: finalConfig, lastUpdate: new Date() } 
    }, { new: true }).lean();

    log('✅ Configuración guardada correctamente.', 'success', userId);
    if (bot) await syncFrontendState(currentPrice, bot, userId);
    return bot;
}

/**
 * ENCENDIDO DE ESTRATEGIA
 */
async function startSide(userId, side, config) {
    const botState = await Autobot.findOne({ userId }).lean();
    const cleanData = side === 'long' ? CLEAN_LONG_ROOT : CLEAN_SHORT_ROOT;
    
    const finalConfig = JSON.parse(JSON.stringify(botState.config));
    if (config && config[side]) {
        Object.assign(finalConfig[side], config[side]);
    }
    
    if (finalConfig[side]) finalConfig[side].enabled = true;

    const update = {
        ...cleanData, 
        [side === 'long' ? 'lstate' : 'sstate']: 'RUNNING',
        config: finalConfig
    };
    
    const bot = await Autobot.findOneAndUpdate({ userId }, { $set: update }, { new: true }).lean();
    log(`🚀 Estrategia ${side.toUpperCase()} encendida.`, 'success', userId);
    await slowBalanceCacheUpdate(userId);
    return bot;
}

/**
 * APAGADO DE ESTRATEGIA
 */
async function stopSide(userId, side) {
    const botState = await Autobot.findOne({ userId }).lean();
    if (!botState) throw new Error("Bot no encontrado");

    const stateField = side === 'long' ? 'lstate' : 'sstate'; 
    const newConfig = JSON.parse(JSON.stringify(botState.config));
    if (newConfig[side]) newConfig[side].enabled = false;

    const update = {
        [stateField]: 'STOPPED',
        config: newConfig,
        lastUpdate: new Date()
    };
    
    const bot = await Autobot.findOneAndUpdate({ userId }, { $set: update }, { new: true }).lean();
    if (bot) await syncFrontendState(lastCyclePrice, bot, userId);

    log(`🛑 Estrategia ${side.toUpperCase()} apagada.`, 'warning', userId);
    return bot;
}

/**
 * MOTOR PRINCIPAL (botCycle)
 */
async function botCycle(priceFromWebSocket) {
    if (isProcessing) return;

    try {
        const currentPrice = parseFloat(priceFromWebSocket);
        if (isNaN(currentPrice) || currentPrice <= 0) return;
        
        isProcessing = true; 
        lastCyclePrice = currentPrice;

        const activeBots = await Autobot.find({
            $or: [
                { lstate: { $ne: 'STOPPED' } },
                { sstate: { $ne: 'STOPPED' } },
                { aistate: 'RUNNING' }
            ]
        }).lean();

        for (const botState of activeBots) {
            const userId = botState.userId;
            const changeSet = {};

            const dependencies = {
                userId,
                log: (msg, type) => log(msg, type, userId),
                io, bitmartService, Autobot, currentPrice,
                availableUSDT: botState.lastAvailableUSDT, 
                availableBTC: botState.lastAvailableBTC,
                botState, config: botState.config,
                updateBotState: async (val, strat) => { 
                    changeSet[strat === 'long' ? 'lstate' : 'sstate'] = val; 
                },
                updateLStateData: async (fields) => { Object.assign(changeSet, fields); },
                updateSStateData: async (fields) => { Object.assign(changeSet, fields); },
                updateGeneralBotState: async (fields) => { Object.assign(changeSet, fields); },
                syncFrontendState: (price, state) => syncFrontendState(price, state, userId)
            };

            // MONITOR DE ÓRDENES
            if (botState.llastOrder && botState.lstate !== 'STOPPED') {
                if (botState.llastOrder.side === 'buy') {
                    await monitorLongBuy(botState, botState.config.symbol, dependencies.log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
                } else {
                    await monitorLongSell(botState, botState.config.symbol, dependencies.log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
                }
            }

            if (botState.slastOrder && botState.sstate !== 'STOPPED') {
                if (botState.slastOrder.side === 'sell') { 
                    await monitorShortSell(botState, botState.config.symbol, dependencies.log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
                } else {
                    await monitorShortBuy(botState, botState.config.symbol, dependencies.log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
                }
            }

            // MATEMÁTICAS LONG
            if (botState.lstate !== 'STOPPED' && botState.config.long) {
                const activeLPPC = changeSet.lppc !== undefined ? changeSet.lppc : (botState.lppc || 0);
                if (activeLPPC > 0) {
                    const { coveragePrice, numberOfOrders } = calculateLongCoverage(botState.lbalance, currentPrice, botState.config.long.purchaseUsdt, parseNumber(botState.config.long.price_var) / 100, parseNumber(botState.config.long.size_var), changeSet.locc || botState.locc || 0, parseNumber(botState.config.long.price_step_inc));
                    changeSet.lcoverage = coveragePrice;
                    changeSet.lnorder = numberOfOrders;
                    changeSet.lprofit = calculatePotentialProfit(activeLPPC, (changeSet.lac || botState.lac || 0), currentPrice, 'long');
                }
            }

            // MATEMÁTICAS SHORT
            if (botState.sstate !== 'STOPPED' && botState.config.short) {
                const activeSPPC = changeSet.sppc !== undefined ? changeSet.sppc : (botState.sppc || 0);
                if (activeSPPC > 0) {
                    const { coveragePrice, numberOfOrders } = calculateShortCoverage(botState.sbalance, currentPrice, botState.config.short.purchaseUsdt, parseNumber(botState.config.short.price_var) / 100, parseNumber(botState.config.short.size_var), changeSet.socc || botState.socc || 0, parseNumber(botState.config.short.price_step_inc));
                    changeSet.scoverage = coveragePrice;
                    changeSet.snorder = numberOfOrders;
                    changeSet.sprofit = calculatePotentialProfit(activeSPPC, (changeSet.sac || botState.sac || 0), currentPrice, 'short');
                }
            }

            // EJECUCIÓN (Ahora pasamos las dependencias directamente)
            if (botState.lstate !== 'STOPPED') await runLongStrategy(dependencies);
            if (botState.sstate !== 'STOPPED') await runShortStrategy(dependencies);
            await runAIStrategy(dependencies); 

            // GUARDADO POR USUARIO
            await commitChanges(userId, changeSet, currentPrice);
        }
        
    } catch (error) {
        log(`❌ Error crítico en el ciclo: ${error.message}`, 'error');
    } finally {
        isProcessing = false; 
    }
}

module.exports = {
    setIo, 
    start: () => log('🚀 Autobot Iniciado', 'success'), 
    stop: () => log('🛑 Autobot Detenido', 'warning'),
    log, botCycle, slowBalanceCacheUpdate, syncFrontendState, getLastPrice, updateConfig, startSide, stopSide
};