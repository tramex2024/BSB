/**
 * BSB/server/autobotLogic.js
 * Unified Cycle Engine - 2026 Audited, Parallel, and Shielded Version
 */

const Autobot = require('./models/Autobot');
const User = require('./models/User'); 
const bitmartService = require('./services/bitmartService');
const orchestrator = require('./utils/cycleOrchestrator');
const { decrypt } = require('./utils/encryption'); 

const { runLongStrategy } = require('./src/longStrategy');
const { runShortStrategy } = require('./src/shortStrategy');
const { runAIStrategy } = require('./src/aiStrategy'); 
const { canExecuteStrategy } = require('./utils/strategyValidator');
const MarketSignal = require('./models/MarketSignal');

// Centralized mathematical engine imports
const { 
    calculateLiveBotMetrics,
    calculatePotentialProfit 
} = require('./autobotCalculations');

const { monitorAndConsolidate: monitorLongBuy } = require('./src/states/long/LongBuyConsolidator');
const { monitorAndConsolidateLongSell: monitorLongSell } = require('./src/states/long/LongSellConsolidator'); 
const { monitorAndConsolidateShort: monitorShortSell } = require('./src/states/short/ShortSellConsolidator');
const { monitorAndConsolidateShortBuy: monitorShortBuy } = require('./src/states/short/ShortBuyConsolidator');

const { updateConfig, startSide, stopSide } = require('./startStop');

let isProcessing = false;

/**
 * Processes an individual trading cycle for a specific bot in an isolated and safe manner.
 * Consumes the centralized MarketSignal database for execution data.
 */
async function processSingleBot(botState, currentPrice) {
    const userId = botState.userId;
    const changeSet = {};

    try {
        // --- 0. CENTRALIZED MARKET DATA RETRIEVAL (SOURCE OF TRUTH) ---
        const marketData = await MarketSignal.findOne({ symbol: botState.config.symbol || 'BTC_USDT' }).lean();
        
        // Total injection of technical indicators required by the AIEngine execution context
        const marketContext = marketData ? {
            rsi14: marketData.rsi14,
            rsi21: marketData.rsi21,
            currentRSI: marketData.currentRSI !== undefined ? marketData.currentRSI : marketData.rsi14,
            prevRSI: marketData.prevRSI !== undefined ? marketData.prevRSI : marketData.rsi14,
            adx: marketData.adx,
            stochK: marketData.stochK,
            stochD: marketData.stochD,
            macdValue: marketData.macdValue,
            macdSignal: marketData.macdSignal,
            macdHist: marketData.macdHist,
            atr: marketData.atr || 0,
            volatilityIndex: marketData.volatilityIndex || 0,
            priceSlope: marketData.priceSlope || 0,
            signal: marketData.signal,
            aiConfidence: marketData.aiConfidence,
            trend: marketData.trend,
            lastUpdate: marketData.lastUpdate || marketData.updatedAt || new Date()
        } : { 
            rsi14: 50, rsi21: 50, currentRSI: 50, prevRSI: 50, adx: 0, 
            stochK: 50, stochD: 50, macdValue: 0, macdSignal: 0, macdHist: 0,
            atr: 0, volatilityIndex: 0, priceSlope: 0, signal: 'NEUTRAL', 
            aiConfidence: 0, trend: 'NEUTRAL', lastUpdate: new Date() 
        };

        const user = await User.findById(userId).lean();
        if (!user || !user.bitmartApiKey) {
            orchestrator.log(`⚠️ Skip: User ${userId} missing API keys.`, 'error', userId);
            return;
        }

        // Secure API Key decryption handling
        let decryptedApiKey, decryptedSecret, decryptedMemo;
        try {
            decryptedApiKey = decrypt(user.bitmartApiKey).trim();
            decryptedSecret = decrypt(user.bitmartSecretKeyEncrypted).trim();
            decryptedMemo = user.bitmartApiMemo ? decrypt(user.bitmartApiMemo).trim() : (user.bitmartApiMemo || "").trim();
        } catch (err) {
            orchestrator.log(`❌ Error decrypting API keys for user ${userId}`, 'error', userId);
            return;
        }

        const userCreds = { apiKey: decryptedApiKey, apiMemo: decryptedMemo, secretKey: decryptedSecret };

        // Synchronize exchange account balances on operational startup
        if (!botState.lastAvailableUSDT && (botState.lstate === 'RUNNING' || botState.aistate === 'RUNNING')) {
            await orchestrator.slowBalanceCacheUpdate(userId);
        }

        // Dependency assembly injection tree
        const dependencies = {
            userId,
            userCreds, 
            marketContext, 
            log: (msg, type) => orchestrator.log(msg, type, userId),
            io: orchestrator.io || null,
            bitmartService, 
            Autobot, 
            currentPrice,
            botState, 
            config: botState.config,
            lcycle: botState.lcycle || 0,
            scycle: botState.scycle || 0,
            aicycle: botState.aicycle || 0,
            availableUSDT: botState.lastAvailableUSDT || 0,

            placeLongOrder: async (params) => bitmartService.placeOrder(params.symbol, params.side, params.type, params.notional || params.size, params.price || null, userCreds, `L_${botState.lcycle || 0}_${Date.now()}`),
            placeShortOrder: async (params) => bitmartService.placeOrder(params.symbol, params.side, params.type, params.notional || params.size, params.price || null, userCreds, `S_${botState.scycle || 0}_${Date.now()}`),
            placeAIOrder: async (params) => bitmartService.placeOrder(params.symbol, params.side, params.type, params.notional || params.size, params.price || null, userCreds, `AI_${botState.aicycle || 0}_${Date.now()}`),
            placeMarketOrder: async (params) => bitmartService.placeMarketOrder(params, userCreds),

            updateBotState: async (val, strat) => { changeSet[strat === 'long' ? 'lstate' : (strat === 'short' ? 'sstate' : 'aistate')] = val; },
            updateLStateData: async (fields) => { Object.assign(changeSet, fields); },
            updateSStateData: async (fields) => { Object.assign(changeSet, fields); },
            updateAIStateData: async (fields) => { Object.assign(changeSet, fields); },
            updateGeneralBotState: async (fields) => { Object.assign(changeSet, fields); },
            syncFrontendState: (price, state) => orchestrator.syncFrontendState(price, state, userId)
        };

        const currentSymbol = botState.config.symbol || 'BTC_USDT';

        // --- 1. ORDER LIFECYCLE MONITORING ---
        if (botState.llastOrder && botState.lstate !== 'STOPPED') {
            try {
                if (botState.llastOrder.side === 'buy') await monitorLongBuy(botState, currentSymbol, dependencies.log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId, dependencies.userCreds);
                else await monitorLongSell(botState, currentSymbol, dependencies.log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId, dependencies.userCreds);
            } catch (e) { orchestrator.log(`Long Monitor Error: ${e.message}`, 'error', userId); }
        }

        if (botState.slastOrder && botState.sstate !== 'STOPPED') {
            try {
                if (botState.slastOrder.side === 'sell') await monitorShortSell(botState, currentSymbol, dependencies.log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId, dependencies.userCreds);
                else await monitorShortBuy(botState, currentSymbol, dependencies.log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId, dependencies.userCreds);
            } catch (e) { orchestrator.log(`Short Monitor Error: ${e.message}`, 'error', userId); }
        }

        // Apply critical changes found during order monitoring stage before processing calculations
        Object.assign(botState, changeSet);

        // --- 2. MATHEMATICAL & COVERAGE CALCULATIONS ---
        // 🟢 DECOUPLED: Mathematical matrix evaluation is offloaded completely to the calculations module
        const liveMetrics = calculateLiveBotMetrics(botState, currentPrice);
        Object.assign(changeSet, liveMetrics);

        // Separate calculation layer for active AI profit matrix tracking
        if (botState.aistate !== 'STOPPED' && botState.config.ai) {
            changeSet.aiprofit = (botState.aippc || 0) > 0 ? calculatePotentialProfit(botState.aippc, botState.ailastEntryPrice || 0, currentPrice, 'ai') : 0;
        }

        // Synchronize structural calculations data into bot state instance prior to engine hand-off
        Object.assign(botState, changeSet);

        // --- 3. STRATEGY EXECUTION ENGINE ---
        if (botState.lstate !== 'STOPPED') await runLongStrategy(dependencies);
        if (botState.sstate !== 'STOPPED') await runShortStrategy(dependencies);
        if (botState.aistate !== 'STOPPED') await runAIStrategy(dependencies);

        // Final merge of strategy execution mutations before atomic storage commit
        Object.assign(botState, changeSet);

        changeSet.lastUpdate = new Date();
        await orchestrator.commitChanges(userId, botState, currentPrice);

    } catch (botErr) {
        console.error(`❌ Error in isolated bot execution for user ${userId}:`, botErr.message);
    }
}

/**
 * Master engine cycle triggered directly by public WebSocket orderbook price updates
 */
async function botCycle(priceFromWebSocket) {
    if (isProcessing) return; // Burst protection against microsecond overlapping price ticks

    try {
        const currentPrice = parseFloat(priceFromWebSocket);
        if (isNaN(currentPrice) || currentPrice <= 0) return;
        
        isProcessing = true; 
        orchestrator.setLastPrice(currentPrice);

        // Fetch only active engines that require computation to safeguard processing cycles
        const activeBots = await Autobot.find({
            $or: [
                { lstate: { $ne: 'STOPPED' } },
                { sstate: { $ne: 'STOPPED' } },
                { aistate: { $ne: 'STOPPED' } }
            ]
        }).lean();

        // [CONCURRENT OPTIMIZATION]: Control active processing through non-blocking parallel workers
        await Promise.all(activeBots.map(bot => processSingleBot(bot, currentPrice)));
        
    } catch (error) {
        orchestrator.log(`❌ Critical error in main cycle: ${error.message}`, 'error');
    } finally {
        isProcessing = false; 
    }
}

/**
 * Global slow balance background synchronization task
 */
function startGlobalSync() {
    setInterval(async () => {
        // 🟢 SHIELDED: Process lock wraps the entire loop sequence to fully prevent collection deadlocks
        if (isProcessing) return; 
        isProcessing = true;
        try {
            const allBots = await Autobot.find({}).lean();
            for (const bot of allBots) {
                await orchestrator.slowBalanceCacheUpdate(bot.userId);
            }
        } catch (err) {
            console.error("[GLOBAL-SYNC-ERROR]:", err.message);
        } finally {
            isProcessing = false;
        }
    }, 45000); // 45s threshold to gracefully clear high-volume Exchange rate limiting rules
}

startGlobalSync();

module.exports = {
    setIo: orchestrator.setIo, 
    start: () => orchestrator.log('🚀 Autobot Started', 'success'), 
    stop: () => orchestrator.log('🛑 Autobot Stopped', 'warning'),
    log: orchestrator.log, 
    botCycle, 
    slowBalanceCacheUpdate: orchestrator.slowBalanceCacheUpdate, 
    syncFrontendState: orchestrator.syncFrontendState, 
    getLastPrice: orchestrator.getLastPrice, 
    updateConfig, startSide, stopSide
};