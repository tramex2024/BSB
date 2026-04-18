/**
 * BSB/server/autobotLogic.js
 * Motor de Ciclos Unificado - Versión Refactorizada 2026
 */

const Autobot = require('./models/Autobot');
const User = require('./models/User'); 
const bitmartService = require('./services/bitmartService');
const orchestrator = require('./src/au/utils/cycleOrchestrator');
const { decrypt } = require('./utils/encryption'); 

const { runLongStrategy } = require('./src/longStrategy');
const { runShortStrategy } = require('./src/shortStrategy');
const { runAIStrategy } = require('./src/aiStrategy'); 
const { canExecuteStrategy } = require('./src/au/utils/strategyValidator');

const { 
    calculateLongCoverage, 
    calculateShortCoverage, 
    parseNumber, 
    calculatePotentialProfit 
} = require('./autobotCalculations');

const { monitorAndConsolidate: monitorLongBuy } = require('./src/au/states/long/LongBuyConsolidator');
const { monitorAndConsolidateLongSell: monitorLongSell } = require('./src/au/states/long/LongSellConsolidator'); 
const { monitorAndConsolidateShort: monitorShortSell } = require('./src/au/states/short/ShortSellConsolidator');
const { monitorAndConsolidateShortBuy: monitorShortBuy } = require('./src/au/states/short/ShortBuyConsolidator');

// IMPORTACIÓN DE NUEVO MÓDULO START/STOP
const { updateConfig, startSide, stopSide } = require('./startStop');

let isProcessing = false;

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
                { aistate: { $ne: 'STOPPED' } }
            ]
        }).lean();

        for (const botState of activeBots) {
            const userId = botState.userId;
            const changeSet = {};

            const user = await User.findById(userId).lean();
            if (!user || !user.bitmartApiKey) {
                orchestrator.log(`⚠️ Salto: Usuario ${userId} sin llaves API.`, 'error', userId);
                continue;
            }

            // --- Lógica de Desencriptación ---
            const decryptedApiKey = decrypt(user.bitmartApiKey).trim();
            const decryptedSecret = decrypt(user.bitmartSecretKeyEncrypted).trim();
            let decryptedMemo = "";
            try {
                decryptedMemo = decrypt(user.bitmartApiMemoEncrypted || user.bitmartApiMemo).trim();
            } catch (e) {
                decryptedMemo = (user.bitmartApiMemo || "").trim();
            }

            const userCreds = {
                apiKey: decryptedApiKey,
                apiMemo: decryptedMemo,
                secretKey: decryptedSecret
            };

            if (!botState.lastAvailableUSDT && (botState.lstate === 'RUNNING' || botState.aistate === 'RUNNING')) {
                await orchestrator.slowBalanceCacheUpdate(userId);
            }

            const dependencies = {
                userId,
                userCreds, // <--- CLAVE: Ahora LBuying recibirá las credenciales
                log: (msg, type) => orchestrator.log(msg, type, userId),
                io: orchestrator.io || null,
                bitmartService, Autobot, currentPrice,
                availableUSDT: botState.lastAvailableUSDT, 
                availableBTC: botState.lastAvailableBTC,
                botState, config: botState.config,
                lcycle: botState.lcycle || 0,
                scycle: botState.scycle || 0,
                aicycle: botState.aicycle || 0,

                placeLongOrder: async (params) => {
                    const clientOrderId = `L_${botState.lcycle || 0}_${Date.now()}`;
                    return await bitmartService.placeOrder(
                        params.symbol, params.side, params.type, 
                        params.notional || params.size, params.price || null, 
                        userCreds, clientOrderId
                    );
                },
                placeShortOrder: async (params) => {
                    const clientOrderId = `S_${botState.scycle || 0}_${Date.now()}`;
                    return await bitmartService.placeOrder(
                        params.symbol, params.side, params.type, 
                        params.notional || params.size, params.price || null, 
                        userCreds, clientOrderId
                    );
                },
                placeAIOrder: async (params) => {
                    const clientOrderId = `AI_${botState.aicycle || 0}_${Date.now()}`;
                    return await bitmartService.placeOrder(
                        params.symbol, params.side, params.type, 
                        params.notional || params.size, params.price || null, 
                        userCreds, clientOrderId
                    );
                },
                placeMarketOrder: async (params) => {
                    return await bitmartService.placeMarketOrder(params, userCreds);
                },

                updateBotState: async (val, strat) => { 
                    const field = strat === 'long' ? 'lstate' : (strat === 'short' ? 'sstate' : 'aistate');
                    changeSet[field] = val; 
                },
                updateLStateData: async (fields) => { Object.assign(changeSet, fields); },
                updateSStateData: async (fields) => { Object.assign(changeSet, fields); },
                updateAIStateData: async (fields) => { Object.assign(changeSet, fields); },
                updateGeneralBotState: async (fields) => { Object.assign(changeSet, fields); },
                syncFrontendState: (price, state) => orchestrator.syncFrontendState(price, state, userId)
            };

            // --- Monitoreo de Órdenes ---
            // --- Monitoreo de Órdenes (Optimizado) ---
// LONG
if (botState.llastOrder && botState.lstate !== 'STOPPED') {
    try {
        const symbol = botState.config.symbol || 'BTC_USDT';
        if (botState.llastOrder.side === 'buy') {
            await monitorLongBuy(botState, symbol, dependencies.log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId, dependencies.userCreds);
        } else {
            await monitorLongSell(botState, symbol, dependencies.log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId, dependencies.userCreds);
        }
    } catch (e) { 
        orchestrator.log(`Error Long Monitor: ${e.message}`, 'error', userId); 
    }
}

// SHORT
if (botState.slastOrder && botState.sstate !== 'STOPPED') {
    try {
        const symbol = botState.config.symbol || 'BTC_USDT';
        // Usamos dependencies.userCreds para garantizar que la variable esté disponible
        if (botState.slastOrder.side === 'sell') { 
            await monitorShortSell(botState, symbol, dependencies.log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId, dependencies.userCreds);
        } else {
            await monitorShortBuy(botState, symbol, dependencies.log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId, dependencies.userCreds);
        }
    } catch (e) { 
        orchestrator.log(`Error Short Monitor: ${e.message}`, 'error', userId); 
    }
}

            // --- Cálculos Matemáticos ---
            if (botState.lstate !== 'STOPPED' && botState.config.long) {
                const activeLBalance = changeSet.lbalance !== undefined ? changeSet.lbalance : (botState.lbalance || 0);
                const activeLOCC = changeSet.locc !== undefined ? changeSet.locc : (botState.locc || 0);
                const longCov = calculateLongCoverage(activeLBalance, currentPrice, botState.config.long.purchaseUsdt, parseNumber(botState.config.long.price_var) / 100, parseNumber(botState.config.long.size_var), activeLOCC, parseNumber(botState.config.long.price_step_inc));
                changeSet.lcoverage = longCov.coveragePrice;
                changeSet.lnorder = longCov.numberOfOrders;
                const activeLPPC = changeSet.lppc !== undefined ? changeSet.lppc : (botState.lppc || 0);
                const activeLAC = changeSet.lac !== undefined ? changeSet.lac : (botState.lac || 0);
                changeSet.lprofit = activeLPPC > 0 ? calculatePotentialProfit(activeLPPC, activeLAC, currentPrice, 'long') : 0;
            }

            if (botState.sstate !== 'STOPPED' && botState.config.short) {
                const activeSBalance = changeSet.sbalance !== undefined ? changeSet.sbalance : (botState.sbalance || 0);
                const activeSOCC = changeSet.socc !== undefined ? changeSet.socc : (botState.socc || 0);
                const shortCov = calculateShortCoverage(activeSBalance, currentPrice, botState.config.short.purchaseUsdt, parseNumber(botState.config.short.price_var) / 100, parseNumber(botState.config.short.size_var), activeSOCC, parseNumber(botState.config.short.price_step_inc));
                changeSet.scoverage = shortCov.coveragePrice;
                changeSet.snorder = shortCov.numberOfOrders;
                const activeSPPC = changeSet.sppc !== undefined ? changeSet.sppc : (botState.sppc || 0);
                const activeSAC = changeSet.sac !== undefined ? changeSet.sac : (botState.sac || 0);
                changeSet.sprofit = activeSPPC > 0 ? calculatePotentialProfit(activeSPPC, activeSAC, currentPrice, 'short') : 0;
            }

            // --- Ejecución de Estrategias con Validador ---
            if (botState.lstate !== 'STOPPED') {
    await runLongStrategy(dependencies);
}

if (botState.sstate !== 'STOPPED') {
    await runShortStrategy(dependencies);
}

if (botState.aistate !== 'STOPPED') {
    await runAIStrategy(dependencies);
}

            changeSet.lastUpdate = new Date();
            await orchestrator.commitChanges(userId, changeSet, currentPrice);
        }
        
    } catch (error) {
        orchestrator.log(`❌ Error crítico en el ciclo: ${error.message}`, 'error');
    } finally {
        isProcessing = false; 
    }
}

function startGlobalSync() {
    setInterval(async () => {
        try {
            const allBots = await Autobot.find({}).lean();
            for (const bot of allBots) {
                await orchestrator.slowBalanceCacheUpdate(bot.userId);
            }
        } catch (err) {
            console.error("[GLOBAL-SYNC-ERROR]:", err.message);
        }
    }, 30000); 
}

startGlobalSync();

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