// Archivo: BSB/server/autobotLogic.js

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/au/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/au/shortStrategy');

// Importaciones de Cálculos (Añadido calculatePotentialProfit)
const { 
    calculateLongCoverage, 
    calculateShortCoverage, 
    parseNumber, 
    calculatePotentialProfit 
} = require('./autobotCalculations');

// Consolidadores
const { monitorAndConsolidate: monitorLongBuy } = require('./src/au/states/long/LongBuyConsolidator');
const { monitorAndConsolidateSell } = require('./src/au/states/long/LongSellConsolidator'); 
const { monitorAndConsolidateShort: monitorShortSell } = require('./src/au/states/short/ShortSellConsolidator');
const { monitorAndConsolidateShortBuy } = require('./src/au/states/short/ShortBuyConsolidator');

let io;
let isProcessing = false; 

function setIo(socketIo) { io = socketIo; }

function log(message, type = 'info') {
    if (io) io.emit('bot-log', { message, type, timestamp: new Date().toISOString() });
    console.log(`[${type.toUpperCase()}]: ${message}`);
}

async function syncFrontendState(currentPrice, botState) {
    if (io && botState) {
        io.emit('bot-state-update', botState); 
        io.emit('marketData', { price: currentPrice });
    }
}

/**
 * commitChanges: Asegura que la progresión exponencial sea grabada atómicamente.
 */
async function commitChanges(changeSet) {
    if (Object.keys(changeSet).length === 0) return null;
    try {
        const updated = await Autobot.findOneAndUpdate({}, { $set: changeSet }, { new: true }).lean();
        if (io) io.emit('bot-state-update', updated);
        return updated;
    } catch (error) {
        console.error(`[DB ATOMIC ERROR]: ${error.message}`);
        return null;
    }
}

function queueLStateUpdate(fields, changeSet) {
    Object.keys(fields).forEach(key => { changeSet[`lStateData.${key}`] = fields[key]; });
}

function queueSStateUpdate(fields, changeSet) {
    Object.keys(fields).forEach(key => { changeSet[`sStateData.${key}`] = fields[key]; });
}

// --- ACTUALIZACIÓN DE SALDOS REALES ---
async function slowBalanceCacheUpdate() {
    let availableUSDT = 0, availableBTC = 0, apiSuccess = false;
    try {
        const balancesArray = await bitmartService.getBalance();
        const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
        const btcBalance = balancesArray.find(b => b.currency === 'BTC');
        availableUSDT = parseFloat(usdtBalance?.available || 0);
        availableBTC = parseFloat(btcBalance?.available || 0);
        apiSuccess = true;
    } catch (error) {
        const current = await Autobot.findOne({}).lean();
        availableUSDT = current?.lastAvailableUSDT || 0;
        availableBTC = current?.lastAvailableBTC || 0;
    }
    const updated = await Autobot.findOneAndUpdate({}, {
        $set: { lastAvailableUSDT: availableUSDT, lastAvailableBTC: availableBTC, lastBalanceCheck: new Date() }
    }, { new: true, upsert: true, lean: true });

    if (io) io.sockets.emit('balance-real-update', { 
        lastAvailableUSDT: updated.lastAvailableUSDT, 
        lastAvailableBTC: updated.lastAvailableBTC, 
        source: apiSuccess ? 'API_SUCCESS' : 'CACHE_FALLBACK' 
    });
    return apiSuccess;
}

// --- CICLO PRINCIPAL (AUTÓNOMO Y EXPONENCIAL) ---
async function botCycle(priceFromWebSocket, externalDependencies = {}) {
    if (isProcessing) return;

    try {
        isProcessing = true; 
        const changeSet = {}; 

        let botState = await Autobot.findOne({}).lean();
        const currentPrice = parseFloat(priceFromWebSocket);
        
        if (!botState || isNaN(currentPrice) || currentPrice <= 0) {
            if (botState) await syncFrontendState(currentPrice, botState);
            return;
        }

        const dependencies = {
            log, io, bitmartService, Autobot, currentPrice,
            availableUSDT: botState.lastAvailableUSDT, 
            availableBTC: botState.lastAvailableBTC,
            botState, config: botState.config,
            updateBotState: async (val, strat) => { changeSet[strat === 'long' ? 'lstate' : 'sstate'] = val; },
            updateLStateData: async (fields) => queueLStateUpdate(fields, changeSet),
            updateSStateData: async (fields) => queueSStateUpdate(fields, changeSet),
            updateGeneralBotState: async (fields) => { Object.assign(changeSet, fields); },
            syncFrontendState, ...externalDependencies
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies);

        // 1. CONSOLIDACIÓN: Sincronización de órdenes antes de actuar
        const lLastOrder = botState.lStateData?.lastOrder;
        if (lLastOrder?.side === 'buy') {
            await monitorLongBuy(botState, botState.config.symbol, log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
        }
        if (lLastOrder?.side === 'sell') {
            await monitorAndConsolidateSell(botState, botState.config.symbol, log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
        }

        const sLastOrder = botState.sStateData?.lastOrder;
        if (sLastOrder?.side === 'sell') {
            await monitorShortSell(botState, botState.config.symbol, log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
        }
        if (sLastOrder?.side === 'buy') {
            await monitorAndConsolidateShortBuy(botState, botState.config.symbol, log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
        }

        // 2. RECALCULAR COBERTURA Y PROFIT EN TIEMPO REAL
        if (botState.lstate !== 'STOPPED' && botState.lStateData.ppc > 0) {
            const { coveragePrice, numberOfOrders } = calculateLongCoverage(
                botState.lbalance, 
                botState.lStateData.ppc, 
                botState.config.long.purchaseUsdt,
                parseNumber(botState.config.long.price_var)/100, 
                parseNumber(botState.config.long.size_var)/100
            );
            changeSet.lcoverage = coveragePrice;
            changeSet.lnorder = numberOfOrders;

            // Corrección de Profit Long
            changeSet.lprofit = calculatePotentialProfit(
                botState.lStateData.ppc,
                botState.lStateData.ac,
                currentPrice,
                'long'
            );
        }

        if (botState.sstate !== 'STOPPED' && botState.sStateData.ppc > 0) {
            const { coveragePrice, numberOfOrders } = calculateShortCoverage(
                botState.sbalance, 
                botState.sStateData.ppc, 
                botState.config.short.purchaseUsdt,
                parseNumber(botState.config.short.price_var)/100, 
                parseNumber(botState.config.short.size_var)/100
            );
            changeSet.scoverage = coveragePrice;
            changeSet.snorder = numberOfOrders;

            // Corrección de Profit Short
            changeSet.sprofit = calculatePotentialProfit(
                botState.sStateData.ppc,
                botState.sStateData.ac,
                currentPrice,
                'short'
            );
        }

        // 3. EJECUCIÓN DE ESTRATEGIA (Lógica de decisión)
        if (botState.lstate !== 'STOPPED') await runLongStrategy();
        if (botState.sstate !== 'STOPPED') await runShortStrategy();

        // 4. PERSISTENCIA Y SINCRONIZACIÓN
        const finalState = await commitChanges(changeSet);
        await syncFrontendState(currentPrice, finalState || botState);
        
    } catch (error) {
        log(`❌ Error crítico en ciclo: ${error.message}`, 'error');
    } finally {
        isProcessing = false; 
    }
}

module.exports = {
    setIo, 
    start: () => log('🚀 Autobot Iniciado', 'success'), 
    stop: () => log('🛑 Autobot Detenido', 'warning'),
    log, 
    botCycle, 
    slowBalanceCacheUpdate, 
    syncFrontendState
};