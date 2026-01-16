// Archivo: BSB/server/autobotLogic.js

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/au/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/au/shortStrategy');

// Importaciones de Cálculos
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
let lastCyclePrice = 0; 

function setIo(socketIo) { io = socketIo; }

function getLastPrice() { return lastCyclePrice; }

function log(message, type = 'info') {
    if (io) io.emit('bot-log', { message, type, timestamp: new Date().toISOString() });
    console.log(`[${type.toUpperCase()}]: ${message}`);
}

async function syncFrontendState(currentPrice, botState) {
    if (io && botState) {
        io.emit('bot-state-update', { ...botState, price: currentPrice }); 
        io.emit('marketData', { price: currentPrice });
    }
}

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

// --- CICLO PRINCIPAL ---
async function botCycle(priceFromWebSocket, externalDependencies = {}) {
    if (isProcessing) return;

    try {
        isProcessing = true; 
        const changeSet = {}; 

        let botState = await Autobot.findOne({}).lean();
        const currentPrice = parseFloat(priceFromWebSocket);
        
        if (!isNaN(currentPrice) && currentPrice > 0) {
            lastCyclePrice = currentPrice;
        }
        
        if (!botState || isNaN(currentPrice) || currentPrice <= 0) {
            if (botState) await syncFrontendState(currentPrice, botState);
            return;
        }

        const dependencies = {
            log, io, bitmartService, Autobot, currentPrice,
            availableUSDT: botState.lastAvailableUSDT, 
            availableBTC: botState.lastAvailableBTC,
            botState, config: botState.config,
            lbalance: botState.lbalance,
            sbalance: botState.sbalance,
            updateBotState: async (val, strat) => { changeSet[strat === 'long' ? 'lstate' : 'sstate'] = val; },
            updateLStateData: async (fields) => queueLStateUpdate(fields, changeSet),
            updateSStateData: async (fields) => queueSStateUpdate(fields, changeSet),
            updateGeneralBotState: async (fields) => { Object.assign(changeSet, fields); },
            syncFrontendState, ...externalDependencies
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies);

        // 1. CONSOLIDACIÓN
        const lLastOrder = botState.lStateData?.lastOrder;
        if (lLastOrder?.side === 'buy' && botState.lstate !== 'STOPPED') {
            await monitorLongBuy(botState, botState.config.symbol, log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
        }
        if (lLastOrder?.side === 'sell' && botState.lstate !== 'STOPPED') {
            await monitorAndConsolidateSell(botState, botState.config.symbol, log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
        }

        const sLastOrder = botState.sStateData?.lastOrder;
        if (sLastOrder?.side === 'sell' && botState.sstate !== 'STOPPED') {
            await monitorShortSell(botState, botState.config.symbol, log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
        }
        if (sLastOrder?.side === 'buy' && botState.sstate !== 'STOPPED') {
            await monitorAndConsolidateShortBuy(botState, botState.config.symbol, log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
        }

        // 2. RECALCULAR INDICADORES (Lógica Exponencial)
        // LONG
        if (botState.lstate !== 'STOPPED') {
            const activeLPPC = changeSet['lStateData.ppc'] !== undefined ? changeSet['lStateData.ppc'] : (botState.lStateData?.ppc || 0);
            const activeLAC = changeSet['lStateData.ac'] !== undefined ? changeSet['lStateData.ac'] : (botState.lStateData?.ac || 0);

            if (activeLPPC > 0) {
                const { coveragePrice, numberOfOrders } = calculateLongCoverage(
                    botState.lbalance, activeLPPC, botState.config.long.purchaseUsdt,
                    parseNumber(botState.config.long.price_var)/100, parseNumber(botState.config.long.size_var)/100
                );
                changeSet.lcoverage = coveragePrice;
                changeSet.lnorder = numberOfOrders;
                changeSet.lprofit = calculatePotentialProfit(activeLPPC, activeLAC, currentPrice, 'long');
            }
        } else {
            // Si está parado, reseteamos visualmente el profit flotante
            changeSet.lprofit = 0;
            changeSet.lcoverage = 0;
            changeSet.lnorder = 0;
        }

        // SHORT
        if (botState.sstate !== 'STOPPED') {
            const activeSPPC = changeSet['sStateData.ppc'] !== undefined ? changeSet['sStateData.ppc'] : (botState.sStateData?.ppc || 0);
            const activeSAC = changeSet['sStateData.ac'] !== undefined ? changeSet['sStateData.ac'] : (botState.sStateData?.ac || 0);

            if (activeSPPC > 0) {
                const { coveragePrice, numberOfOrders } = calculateShortCoverage(
                    botState.sbalance, activeSPPC, botState.config.short.purchaseUsdt, 
                    parseNumber(botState.config.short.price_var)/100, parseNumber(botState.config.short.size_var)/100
                );
                changeSet.scoverage = coveragePrice;
                changeSet.snorder = numberOfOrders;
                changeSet.sprofit = calculatePotentialProfit(activeSPPC, activeSAC, currentPrice, 'short');
            }
        } else {
            changeSet.sprofit = 0;
            changeSet.scoverage = 0;
            changeSet.snorder = 0;
        }

        // 3. EJECUCIÓN ESTRATÉGICA
        if (botState.lstate !== 'STOPPED') await runLongStrategy();
        if (botState.sstate !== 'STOPPED') await runShortStrategy();

        // 4. PERSISTENCIA Y EMISIÓN
        const finalState = await commitChanges(changeSet);
        
        if (finalState) {
            await syncFrontendState(currentPrice, finalState);
        }
        
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
    syncFrontendState,
    getLastPrice 
};