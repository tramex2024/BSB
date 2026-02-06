// Archivo: BSB/server/autobotLogic.js

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/au/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/au/shortStrategy');

// Importaciones de Cálculos (Motor Exponencial)
const { 
    calculateLongCoverage, 
    calculateShortCoverage, 
    parseNumber, 
    calculatePotentialProfit 
} = require('./autobotCalculations');

// Consolidadores (Monitorean órdenes en el Exchange)
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

/**
 * Persistencia atómica de todos los cambios acumulados en el ciclo.
 */
async function commitChanges(changeSet) {
    if (Object.keys(changeSet).length === 0) return null;
    try {
        const updated = await Autobot.findOneAndUpdate({}, { $set: changeSet }, { new: true }).lean();
        if (io && updated) io.emit('bot-state-update', updated);
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

/**
 * Actualiza el caché de balances reales desde BitMart.
 */
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
        
        if (!botState || !botState.config || isNaN(currentPrice) || currentPrice <= 0) {
            if (botState) await syncFrontendState(currentPrice, botState);
            return;
        }

        const dependencies = {
            log, 
            io, 
            bitmartService, 
            Autobot, 
            currentPrice,
            availableUSDT: botState.lastAvailableUSDT, 
            availableBTC: botState.lastAvailableBTC,
            botState, 
            config: botState.config,
            updateBotState: async (val, strat) => { 
                changeSet[strat === 'long' ? 'lstate' : 'sstate'] = val; 
            },
            updateLStateData: async (fields) => queueLStateUpdate(fields, changeSet),
            updateSStateData: async (fields) => queueSStateUpdate(fields, changeSet),
            updateGeneralBotState: async (fields) => { 
                Object.assign(changeSet, fields); 
            },
            syncFrontendState
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies);

        // 1. CONSOLIDACIÓN (Verificar si órdenes pendientes se llenaron)
        const lLastOrder = botState.lStateData?.lastOrder;
        if (lLastOrder && botState.lstate !== 'STOPPED') {
            if (lLastOrder.side === 'buy') await monitorLongBuy(botState, botState.config.symbol, log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
            else await monitorAndConsolidateSell(botState, botState.config.symbol, log, dependencies.updateLStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
        }

        const sLastOrder = botState.sStateData?.lastOrder;
        if (sLastOrder && botState.sstate !== 'STOPPED') {
            if (sLastOrder.side === 'sell') await monitorShortSell(botState, botState.config.symbol, log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
            else await monitorAndConsolidateShortBuy(botState, botState.config.symbol, log, dependencies.updateSStateData, dependencies.updateBotState, dependencies.updateGeneralBotState);
        }

        // 2. RECALCULAR INDICADORES (Uso de Lógica Exponencial)
        
        // --- PROCESAMIENTO LONG ---
        if (botState.lstate !== 'STOPPED' && botState.config.long) {
            const activeLPPC = changeSet['lStateData.ppc'] !== undefined ? changeSet['lStateData.ppc'] : (botState.lStateData?.ppc || 0);
            const activeLAC = changeSet['lStateData.ac'] !== undefined ? changeSet['lStateData.ac'] : (botState.lStateData?.ac || 0);
            const lOrderCount = changeSet['lStateData.orderCountInCycle'] !== undefined ? changeSet['lStateData.orderCountInCycle'] : (botState.lStateData?.orderCountInCycle || 0);

            if (activeLPPC > 0) {
                const { coveragePrice, numberOfOrders } = calculateLongCoverage(
                    botState.lbalance, 
                    currentPrice, // Usamos precio actual para ver resistencia real
                    botState.config.long.purchaseUsdt,
                    parseNumber(botState.config.long.price_var) / 100, 
                    parseNumber(botState.config.long.size_var), // Enviamos entero
                    lOrderCount
                );
                changeSet.lcoverage = coveragePrice;
                changeSet.lnorder = numberOfOrders;
                changeSet.lprofit = calculatePotentialProfit(activeLPPC, activeLAC, currentPrice, 'long');
            }
        }

        // --- PROCESAMIENTO SHORT ---
        if (botState.sstate !== 'STOPPED' && botState.config.short) {
            const activeSPPC = changeSet['sStateData.ppc'] !== undefined ? changeSet['sStateData.ppc'] : (botState.sStateData?.ppc || 0);
            const activeSAC = changeSet['sStateData.ac'] !== undefined ? changeSet['sStateData.ac'] : (botState.sStateData?.ac || 0);
            const sOrderCount = changeSet['sStateData.orderCountInCycle'] !== undefined ? changeSet['sStateData.orderCountInCycle'] : (botState.sStateData?.orderCountInCycle || 0);

            if (activeSPPC > 0) {
                const { coveragePrice, numberOfOrders } = calculateShortCoverage(
                    botState.sbalance, 
                    currentPrice, 
                    botState.config.short.purchaseUsdt, 
                    parseNumber(botState.config.short.price_var) / 100, 
                    parseNumber(botState.config.short.size_var), // Enviamos entero
                    sOrderCount
                );
                changeSet.scoverage = coveragePrice;
                changeSet.snorder = numberOfOrders;
                changeSet.sprofit = calculatePotentialProfit(activeSPPC, activeSAC, currentPrice, 'short');
            }
        }

        // 3. EJECUCIÓN DE ESTRATEGIA (Toma de decisiones)
        if (botState.lstate !== 'STOPPED') await runLongStrategy();
        if (botState.sstate !== 'STOPPED') await runShortStrategy();

        // 4. PERSISTENCIA
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
    log, 
    botCycle, 
    slowBalanceCacheUpdate, 
    syncFrontendState,
    getLastPrice 
};