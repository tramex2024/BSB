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
 * commitChanges: El Notario Atómico.
 * Fusiona todos los cambios del ciclo y los graba en una sola operación de DB.
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

// --- CICLO PRINCIPAL (RESILIENTE AL PARPADEO) ---
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
            // Sincronización de balances de pierna (Ambos ahora en USDT)
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

        // 1. CONSOLIDACIÓN: Sincronizar órdenes
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

        // 2. RECALCULAR INDICADORES
        // LONG
        const activeLPPC = changeSet['lStateData.ppc'] !== undefined ? changeSet['lStateData.ppc'] : botState.lStateData.ppc;
        const activeLAC = changeSet['lStateData.ac'] !== undefined ? changeSet['lStateData.ac'] : botState.lStateData.ac;

        if (botState.lstate !== 'STOPPED' && activeLPPC > 0) {
            const { coveragePrice, numberOfOrders } = calculateLongCoverage(
                botState.lbalance, activeLPPC, botState.config.long.purchaseUsdt,
                parseNumber(botState.config.long.price_var)/100, parseNumber(botState.config.long.size_var)/100
            );
            changeSet.lcoverage = coveragePrice;
            changeSet.lnorder = numberOfOrders;
            changeSet.lprofit = calculatePotentialProfit(activeLPPC, activeLAC, currentPrice, 'long');
        }

        // SHORT (Corregido para usar purchaseUsdt y sbalance de USDT)
        const activeSPPC = changeSet['sStateData.ppc'] !== undefined ? changeSet['sStateData.ppc'] : botState.sStateData.ppc;
        const activeSAC = changeSet['sStateData.ac'] !== undefined ? changeSet['sStateData.ac'] : botState.sStateData.ac;

        if (botState.sstate !== 'STOPPED' && activeSPPC > 0) {
            const { coveragePrice, numberOfOrders } = calculateShortCoverage(
                botState.sbalance, // Ahora es el saldo asignado en USDT
                activeSPPC, 
                botState.config.short.purchaseUsdt, // Campo unificado
                parseNumber(botState.config.short.price_var)/100, 
                parseNumber(botState.config.short.size_var)/100
            );
            changeSet.scoverage = coveragePrice;
            changeSet.snorder = numberOfOrders;
            changeSet.sprofit = calculatePotentialProfit(activeSPPC, activeSAC, currentPrice, 'short');
        }

        // 3. EJECUCIÓN DE ESTRATEGIA
        if (botState.lstate !== 'STOPPED') await runLongStrategy();
        if (botState.sstate !== 'STOPPED') await runShortStrategy();

        // 4. PERSISTENCIA ÚNICA Y ATÓMICA
        const finalState = await commitChanges(changeSet);
        
        // Sincronización extra para el Profit (Garantiza que el front reciba el dato fresco)
if (io && finalState) {
    io.emit('bot-profit-update', {
        lprofit: finalState.lprofit,
        sprofit: finalState.sprofit
    });
}
        await syncFrontendState(currentPrice, finalState || botState);
        
    } catch (error) {
        log(`❌ Error crítico en ciclo: ${error.message}`, 'error');
    } finally {
        isProcessing = false; 
    }
}

/**
 * Verifica si debe apagar una pierna específica basándose en la config independiente.
 */
async function checkIndependentStop(type, changeSet, botState) {
    const config = botState.config[type];
    
    if (config && config.stopAtCycle) {
        log(`[${type.toUpperCase()}] Ciclo completado. Aplicando STOP preventivo.`, 'warning');
        
        // 1. Cambiamos el estado a STOPPED
        changeSet[type === 'long' ? 'lstate' : 'sstate'] = 'STOPPED';
        
        // 2. Deshabilitamos para persistencia
        changeSet[`config.${type}.enabled`] = false;
        
        return true;
    }
    return false;
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