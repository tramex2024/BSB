/**
 * BSB/server/autobotLogic.js
 * Motor de Ciclos Unificado - Refactorizado para Claridad y Rendimiento.
 */

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const orchestrator = require('./src/au/utils/cycleOrchestrator');

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

const { monitorAndConsolidate: monitorLongBuy } = require('./src/au/states/long/LongBuyConsolidator');
const { monitorAndConsolidateSell: monitorLongSell } = require('./src/au/states/long/LongSellConsolidator'); 
const { monitorAndConsolidateShort: monitorShortSell } = require('./src/au/states/short/ShortSellConsolidator');
const { monitorAndConsolidateShortBuy: monitorShortBuy } = require('./src/au/states/short/ShortBuyConsolidator');

let isProcessing = false;

/**
 * GESTIÓN DE CONFIGURACIÓN (Lógica Completa)
 */
async function updateConfig(userId, newConfig) {
    const currentPrice = orchestrator.getLastPrice();
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

    orchestrator.log('✅ Configuración guardada correctamente.', 'success', userId);
    if (bot) await orchestrator.syncFrontendState(currentPrice, bot, userId);
    return bot;
}

/**
 * ENCENDIDO DE ESTRATEGIA (Lógica Completa)
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
    orchestrator.log(`🚀 Estrategia ${side.toUpperCase()} encendida.`, 'success', userId);
    await orchestrator.slowBalanceCacheUpdate(userId);
    return bot;
}

/**
 * APAGADO DE ESTRATEGIA (Lógica Completa)
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
    if (bot) await orchestrator.syncFrontendState(orchestrator.getLastPrice(), bot, userId);

    orchestrator.log(`🛑 Estrategia ${side.toUpperCase()} apagada.`, 'warning', userId);
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
        orchestrator.setLastPrice(currentPrice);

        const activeBots = await Autobot.find({
            $or: [
                { lstate: { $ne: 'STOPPED' } },
                { sstate: { $ne: 'STOPPED' } },
                { aistate: 'RUNNING' }
            ]
        }).lean();

        for (const botState of activeBots) {
            const userId = botState.userId;

            // VALIDACIÓN PREVIA DE SEGURIDAD
         if (!botState.lastAvailableUSDT && botState.lstate === 'RUNNING') {
             // Si el bot está corriendo pero no tiene saldo registrado, 
             // forzamos una actualización de balance antes de procesar estrategias.
             await orchestrator.slowBalanceCacheUpdate(userId);
         }
            const changeSet = {};

            const dependencies = {
                userId,
                log: (msg, type) => orchestrator.log(msg, type, userId),
                io: null, bitmartService, Autobot, currentPrice,
                availableUSDT: botState.lastAvailableUSDT, 
                availableBTC: botState.lastAvailableBTC,
                botState, config: botState.config,
                lcycle: botState.lcycle || 0,
                scycle: botState.scycle || 0,
                aicycle: botState.aicycle || 0,

                placeLongOrder: async (params, creds) => {
                    return await bitmartService.placeMarketOrder({
                        ...params,
                        clientOrderId: `L_${botState.lcycle || 0}_${Date.now()}`
                    }, creds);
                },
                placeShortOrder: async (params, creds) => {
                    return await bitmartService.placeMarketOrder({
                        ...params,
                        clientOrderId: `S_${botState.scycle || 0}_${Date.now()}`
                    }, creds);
                },
                placeAIOrder: async (params, creds) => {
                    return await bitmartService.placeMarketOrder({
                        ...params,
                        clientOrderId: `AI_${botState.aicycle || 0}_${Date.now()}`
                    }, creds);
                },

                updateBotState: async (val, strat) => { 
                    changeSet[strat === 'long' ? 'lstate' : 'sstate'] = val; 
                },
                updateLStateData: async (fields) => { Object.assign(changeSet, fields); },
                updateSStateData: async (fields) => { Object.assign(changeSet, fields); },
                updateGeneralBotState: async (fields) => { Object.assign(changeSet, fields); },
                syncFrontendState: (price, state) => orchestrator.syncFrontendState(price, state, userId)
            };

           // --- MONITOR DE ÓRDENES LONG ---
if (botState.llastOrder && botState.lstate !== 'STOPPED') {
    if (botState.llastOrder.side === 'buy') {
        // Agregamos userId al final
        await monitorLongBuy(botState, botState.config.symbol, dependencies.log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId);
    } else {
        // Agregamos userId al final
        await monitorLongSell(botState, botState.config.symbol, dependencies.log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId);
    }
}

// --- MONITOR DE ÓRDENES SHORT ---
if (botState.slastOrder && botState.sstate !== 'STOPPED') {
    if (botState.slastOrder.side === 'sell') { 
        // Agregamos userId al final
        await monitorShortSell(botState, botState.config.symbol, dependencies.log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId);
    } else {
        // Agregamos userId al final
        await monitorShortBuy(botState, botState.config.symbol, dependencies.log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId);
    }
}

      // --- MATEMÁTICAS LONG (Sincronización Total con Precio Real) ---
if (botState.lstate !== 'STOPPED' && botState.config.long) {
    const activeLPPC = changeSet.lppc !== undefined ? changeSet.lppc : (botState.lppc || 0);
    const activeLBalance = changeSet.lbalance !== undefined ? changeSet.lbalance : (botState.lbalance || 0);
    const activeLOCC = changeSet.locc !== undefined ? changeSet.locc : (botState.locc || 0);
    const activeLAC = changeSet.lac !== undefined ? changeSet.lac : (botState.lac || 0);

    // Eliminamos el "if (activeLPPC > 0)" para que el coverage se calcule siempre
    const longCov = calculateLongCoverage(
        activeLBalance, 
        currentPrice, 
        botState.config.long.purchaseUsdt, 
        parseNumber(botState.config.long.price_var) / 100, 
        parseNumber(botState.config.long.size_var), 
        activeLOCC, 
        parseNumber(botState.config.long.price_step_inc)
    );
    
    changeSet.lcoverage = longCov.coveragePrice;
    changeSet.lnorder = longCov.numberOfOrders;
    
    // El PNL sí depende de tener una posición activa
    changeSet.lprofit = activeLPPC > 0 ? calculatePotentialProfit(activeLPPC, activeLAC, currentPrice, 'long') : 0;
}

// --- MATEMÁTICAS SHORT (Sincronización Total con Precio Real) ---
if (botState.sstate !== 'STOPPED' && botState.config.short) {
    const activeSPPC = changeSet.sppc !== undefined ? changeSet.sppc : (botState.sppc || 0);
    const activeSBalance = changeSet.sbalance !== undefined ? changeSet.sbalance : (botState.sbalance || 0);
    const activeSOCC = changeSet.socc !== undefined ? changeSet.socc : (botState.socc || 0);
    const activeSAC = changeSet.sac !== undefined ? changeSet.sac : (botState.sac || 0);

    // Eliminamos el "if (activeSPPC > 0)"
    const shortCov = calculateShortCoverage(
        activeSBalance, 
        currentPrice, 
        botState.config.short.purchaseUsdt, 
        parseNumber(botState.config.short.price_var) / 100, 
        parseNumber(botState.config.short.size_var), 
        activeSOCC, 
        parseNumber(botState.config.short.price_step_inc)
    );

    changeSet.scoverage = shortCov.coveragePrice;
    changeSet.snorder = shortCov.numberOfOrders;
    
    // El PNL sí depende de tener una posición activa
    changeSet.sprofit = activeSPPC > 0 ? calculatePotentialProfit(activeSPPC, activeSAC, currentPrice, 'short') : 0;
}

            // EJECUCIÓN
            if (botState.lstate !== 'STOPPED') await runLongStrategy(dependencies);
            if (botState.sstate !== 'STOPPED') await runShortStrategy(dependencies);
            await runAIStrategy(dependencies); 

            // GUARDADO POR USUARIO
            await orchestrator.commitChanges(userId, changeSet, currentPrice);
        }
        
    } catch (error) {
        orchestrator.log(`❌ Error crítico en el ciclo: ${error.message}`, 'error');
    } finally {
        isProcessing = false; 
    }
}

module.exports = {
    setIo: orchestrator.setIo, 
    start: () => orchestrator.log('🚀 Autobot Iniciado', 'success'), 
    stop: () => orchestrator.log('🛑 Autobot Detenido', 'warning'),
    log: orchestrator.log, 
    botCycle, 
    slowBalanceCacheUpdate: orchestrator.slowBalanceCacheUpdate, 
    syncFrontendState: orchestrator.syncFrontendState, 
    getLastPrice: orchestrator.getLastPrice, 
    updateConfig, startSide, stopSide
};