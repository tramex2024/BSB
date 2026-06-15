/**
 * BSB/server/autobotLogic.js
 * Motor de Ciclos Unificado - Versión 2026 Auditada, Paralela y Blindada
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

const { 
    calculateLongCoverage, 
    calculateShortCoverage, 
    parseNumber, 
    calculatePotentialProfit 
} = require('./autobotCalculations');

const { monitorAndConsolidate: monitorLongBuy } = require('./src/states/long/LongBuyConsolidator');
const { monitorAndConsolidateLongSell: monitorLongSell } = require('./src/states/long/LongSellConsolidator'); 
const { monitorAndConsolidateShort: monitorShortSell } = require('./src/states/short/ShortSellConsolidator');
const { monitorAndConsolidateShortBuy: monitorShortBuy } = require('./src/states/short/ShortBuyConsolidator');

const { updateConfig, startSide, stopSide } = require('./startStop');

let isProcessing = false;

/**
 * Procesa el ciclo individual de trading para un bot específico de forma aislada y segura
 * Versión Integrada: Consume MarketSignal centralizado para toma de decisiones
 */
async function processSingleBot(botState, currentPrice) {
    const userId = botState.userId;
    const changeSet = {};

    try {
        // --- 0. OBTENCIÓN DE DATOS CENTRALIZADOS (FUENTE DE VERDAD) ---
        const marketData = await MarketSignal.findOne({ symbol: botState.config.symbol || 'BTC_USDT' }).lean();
        
        // Contexto técnico que será inyectado en las estrategias
        const marketContext = marketData ? {
            rsi14: marketData.rsi14,
            adx: marketData.adx,
            signal: marketData.signal,
            aiConfidence: marketData.aiConfidence,
            trend: marketData.trend
        } : { rsi14: 50, adx: 0, signal: 'NEUTRAL', aiConfidence: 0, trend: 'NEUTRAL' };

        const user = await User.findById(userId).lean();
        if (!user || !user.bitmartApiKey) {
            orchestrator.log(`⚠️ Skip: User ${userId} missing API keys.`, 'error', userId);
            return;
        }

        // Desencriptación segura de llaves
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

        // Sincronización de balances
        if (!botState.lastAvailableUSDT && (botState.lstate === 'RUNNING' || botState.aistate === 'RUNNING')) {
            await orchestrator.slowBalanceCacheUpdate(userId);
        }

        // Construcción de dependencias (INYECTAMOS marketContext)
        const dependencies = {
            userId,
            userCreds, 
            marketContext, // <--- NUEVA FUENTE DE DATOS PARA ESTRATEGIAS
            log: (msg, type) => orchestrator.log(msg, type, userId),
            io: orchestrator.io || null,
            bitmartService, Autobot, currentPrice,
            availableUSDT: botState.lastAvailableUSDT, 
            availableBTC: botState.lastAvailableBTC,
            botState, 
            config: botState.config,
            lcycle: botState.lcycle || 0,
            scycle: botState.scycle || 0,
            aicycle: botState.aicycle || 0,

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

        // --- 1. MONITOREO DE ÓRDENES ---
        if (botState.llastOrder && botState.lstate !== 'STOPPED') {
            try {
                if (botState.llastOrder.side === 'buy') await monitorLongBuy(botState, currentSymbol, dependencies.log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId, dependencies.userCreds);
                else await monitorLongSell(botState, currentSymbol, dependencies.log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId, dependencies.userCreds);
            } catch (e) { orchestrator.log(`Error Long Monitor: ${e.message}`, 'error', userId); }
        }

        if (botState.slastOrder && botState.sstate !== 'STOPPED') {
            try {
                if (botState.slastOrder.side === 'sell') await monitorShortSell(botState, currentSymbol, dependencies.log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId, dependencies.userCreds);
                else await monitorShortBuy(botState, currentSymbol, dependencies.log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState, userId, dependencies.userCreds);
            } catch (e) { orchestrator.log(`Error Short Monitor: ${e.message}`, 'error', userId); }
        }

        Object.assign(botState, changeSet);

        // --- 2. CÁLCULOS MATEMÁTICOS ---
        if (botState.lstate !== 'STOPPED' && botState.config.long) {
            const longCov = calculateLongCoverage(botState.lbalance || 0, botState.locc > 0 ? (botState.llep || currentPrice) : currentPrice, botState.config.long.purchaseUsdt, parseNumber(botState.config.long.price_var) / 100, parseNumber(botState.config.long.size_var), botState.locc || 0, parseNumber(botState.config.long.price_step_inc));
            changeSet.lcoverage = longCov.coveragePrice;
            changeSet.lnorder = longCov.numberOfOrders;
            changeSet.lprofit = (botState.lppc || 0) > 0 ? calculatePotentialProfit(botState.lppc, botState.lac || 0, currentPrice, 'long') : 0;
        }

        if (botState.sstate !== 'STOPPED' && botState.config.short) {
            const shortCov = calculateShortCoverage(botState.sbalance || 0, botState.socc > 0 ? (botState.slep || currentPrice) : currentPrice, botState.config.short.purchaseUsdt, parseNumber(botState.config.short.price_var) / 100, parseNumber(botState.config.short.size_var), botState.socc || 0, parseNumber(botState.config.short.price_step_inc));
            changeSet.scoverage = shortCov.coveragePrice;
            changeSet.snorder = shortCov.numberOfOrders;
            changeSet.sprofit = (botState.sppc || 0) > 0 ? calculatePotentialProfit(botState.sppc, botState.sac || 0, currentPrice, 'short') : 0;
        }

        if (botState.aistate !== 'STOPPED' && botState.config.ai) {
            changeSet.aiprofit = (botState.aippc || 0) > 0 ? calculatePotentialProfit(botState.aippc, botState.aiac || 0, currentPrice, 'ai') : 0;
        }

        Object.assign(botState, changeSet);

        // --- 3. EJECUCIÓN DE ESTRATEGIAS ---
        if (botState.lstate !== 'STOPPED') await runLongStrategy(dependencies);
        if (botState.sstate !== 'STOPPED') await runShortStrategy(dependencies);
        if (botState.aistate !== 'STOPPED') await runAIStrategy(dependencies);

        changeSet.lastUpdate = new Date();
        await orchestrator.commitChanges(userId, botState, currentPrice);

    } catch (botErr) {
        console.error(`❌ Error en ejecución aislada del bot de usuario ${userId}:`, botErr.message);
    }
}

/**
 * Ciclo maestro disparado por los precios del WebSocket público
 */
async function botCycle(priceFromWebSocket) {
    if (isProcessing) return; // Protección contra ticks en ráfaga muy cercanos

    try {
        const currentPrice = parseFloat(priceFromWebSocket);
        if (isNaN(currentPrice) || currentPrice <= 0) return;
        
        isProcessing = true; 
        orchestrator.setLastPrice(currentPrice);

        // Obtenemos solo los bots que requieren procesamiento computacional
        const activeBots = await Autobot.find({
            $or: [
                { lstate: { $ne: 'STOPPED' } },
                { sstate: { $ne: 'STOPPED' } },
                { aistate: { $ne: 'STOPPED' } }
            ]
        }).lean();

        // [OPTIMIZACIÓN CONCURRENTE]: Reemplazamos el for secuencial por ejecuciones en paralelo controladas.
        // Evita retrasos de cola y pérdida de lecturas de ticks de precio esenciales.
        await Promise.all(activeBots.map(bot => processSingleBot(bot, currentPrice)));
        
    } catch (error) {
        orchestrator.log(`❌ Critical error in main cycle: ${error.message}`, 'error');
    } finally {
        isProcessing = false; 
    }
}

/**
 * Sincronización global lenta de balances
 */
function startGlobalSync() {
    setInterval(async () => {
        // [BLINDAJE]: Si el bot está procesando órdenes en un tick de precio, retrasamos la sincronización 
        // para evitar bloqueos mutuos de colecciones en MongoDB.
        if (isProcessing) return; 
        try {
            const allBots = await Autobot.find({}).lean();
            for (const bot of allBots) {
                await orchestrator.slowBalanceCacheUpdate(bot.userId);
            }
        } catch (err) {
            console.error("[GLOBAL-SYNC-ERROR]:", err.message);
        }
    }, 45000); // Elevado ligeramente a 45s para mitigar abusos de Rate Limits
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