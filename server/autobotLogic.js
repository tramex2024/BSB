// Archivo: BSB/server/autobotLogic.js

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/au/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/au/shortStrategy');

// Motor Exponencial
const { 
    calculateLongCoverage, 
    calculateShortCoverage, 
    parseNumber, 
    calculatePotentialProfit 
} = require('./autobotCalculations');

// Consolidadores
const { monitorAndConsolidate: monitorLongBuy } = require('./src/au/states/long/LongBuyConsolidator');
const { monitorAndConsolidateSell: monitorLongSell } = require('./src/au/states/long/LongSellConsolidator'); 
const { monitorAndConsolidateShort: monitorShortSell } = require('./src/au/states/short/ShortSellConsolidator');
const { monitorAndConsolidateShortBuy: monitorShortBuy } = require('./src/au/states/short/ShortBuyConsolidator');

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

/**
 * Persistencia Atómica: Guarda cambios en bloque.
 */
async function commitChanges(changeSet) {
    if (Object.keys(changeSet).length === 0) return null;
    try {
        // ✅ Aseguramos actualización de timestamp en cada commit
        changeSet.lastUpdate = new Date();
        const updated = await Autobot.findOneAndUpdate({}, { $set: changeSet }, { new: true }).lean();
        if (io && updated) io.emit('bot-state-update', updated);
        return updated;
    } catch (error) {
        console.error(`[DB ATOMIC ERROR]: ${error.message}`);
        return null;
    }
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

async function botCycle(priceFromWebSocket) {
    if (isProcessing) return;

    try {
        isProcessing = true; 
        const changeSet = {}; 

        let botState = await Autobot.findOne({}).lean();
        const currentPrice = parseFloat(priceFromWebSocket);
        
        if (!isNaN(currentPrice) && currentPrice > 0) {
            lastCyclePrice = currentPrice;
        }
        
        if (!botState || !botState.config || isNaN(currentPrice) || currentPrice <= 0) {
            if (botState) await syncFrontendState(currentPrice, botState);
            return;
        }

        const dependencies = {
            log, io, bitmartService, Autobot, currentPrice,
            availableUSDT: botState.lastAvailableUSDT, 
            availableBTC: botState.lastAvailableBTC,
            botState, config: botState.config,
            updateBotState: async (val, strat) => { 
                changeSet[strat === 'long' ? 'lstate' : 'sstate'] = val; 
            },
            updateLStateData: async (fields) => { Object.assign(changeSet, fields); },
            updateSStateData: async (fields) => { Object.assign(changeSet, fields); },
            updateGeneralBotState: async (fields) => { Object.assign(changeSet, fields); },
            syncFrontendState
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies);

        // 1. CONSOLIDACIÓN
        if (botState.llastOrder && botState.lstate !== 'STOPPED') {
            if (botState.llastOrder.side === 'buy') {
                await monitorLongBuy(botState, botState.config.symbol, log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
            } else {
                await monitorLongSell(botState, botState.config.symbol, log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
            }
        }

        if (botState.slastOrder && botState.sstate !== 'STOPPED') {
            if (botState.slastOrder.side === 'sell') { 
                await monitorShortSell(botState, botState.config.symbol, log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
            } else {
                await monitorShortBuy(botState, botState.config.symbol, log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
            }
        }

        // 2. RECALCULAR INDICADORES (Lógica Exponencial)
        // --- LONG ---
        if (botState.lstate !== 'STOPPED' && botState.config.long) {
            const activeLPPC = changeSet.lppc !== undefined ? changeSet.lppc : (botState.lppc || 0);
            const activeLAC = changeSet.lac !== undefined ? changeSet.lac : (botState.lac || 0);
            const lOrderCount = changeSet.locc !== undefined ? changeSet.locc : (botState.locc || 0);

            if (activeLPPC > 0) {
                // ✅ Usamos price_var de la config
                const { coveragePrice, numberOfOrders } = calculateLongCoverage(
                    botState.lbalance, currentPrice, botState.config.long.purchaseUsdt,
                    parseNumber(botState.config.long.price_var) / 100, 
                    parseNumber(botState.config.long.size_var), lOrderCount
                );
                changeSet.lcoverage = coveragePrice;
                changeSet.lnorder = numberOfOrders;
                changeSet.lprofit = calculatePotentialProfit(activeLPPC, activeLAC, currentPrice, 'long');
            }
        }

        // --- SHORT ---
        if (botState.sstate !== 'STOPPED' && botState.config.short) {
            const activeSPPC = changeSet.sppc !== undefined ? changeSet.sppc : (botState.sppc || 0);
            const activeSAC = changeSet.sac !== undefined ? changeSet.sac : (botState.sac || 0);
            const sOrderCount = changeSet.socc !== undefined ? changeSet.socc : (botState.socc || 0);

            if (activeSPPC > 0) {
                const { coveragePrice, numberOfOrders } = calculateShortCoverage(
                    botState.sbalance, currentPrice, botState.config.short.purchaseUsdt, 
                    parseNumber(botState.config.short.price_var) / 100, 
                    parseNumber(botState.config.short.size_var), sOrderCount
                );
                changeSet.scoverage = coveragePrice;
                changeSet.snorder = numberOfOrders;
                changeSet.sprofit = calculatePotentialProfit(activeSPPC, activeSAC, currentPrice, 'short');
            }
        }

        // 3. EJECUCIÓN DE ESTRATEGIA (Decision Making)
        if (botState.lstate !== 'STOPPED') await runLongStrategy();
        if (botState.sstate !== 'STOPPED') await runShortStrategy();

        // 4. PERSISTENCIA FINAL ATÓMICA
        const finalState = await commitChanges(changeSet);
        if (finalState) await syncFrontendState(currentPrice, finalState);
        
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
    log, botCycle, slowBalanceCacheUpdate, syncFrontendState, getLastPrice 
};