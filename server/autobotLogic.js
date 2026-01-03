// BSB/server/autobotLogic.js

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/au/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/au/shortStrategy');

// Importaciones de Cálculos
const { calculateLongCoverage, calculateShortCoverage, parseNumber } = require('./autobotCalculations');

// Consolidadores
const { monitorAndConsolidate: monitorLongBuy } = require('./src/au/states/long/LongBuyConsolidator');
const { monitorAndConsolidateSell } = require('./src/au/states/long/LongSellConsolidator'); 
const { monitorAndConsolidateShort: monitorShortSell } = require('./src/au/states/short/ShortSellConsolidator');
const { monitorAndConsolidateShortBuy } = require('./src/au/states/short/ShortBuyConsolidator'); // <-- Nueva

let io;

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

async function updateBotState(newState, strategy) {
    try {
        const updateField = strategy === 'long' ? 'lstate' : 'sstate';
        const updated = await Autobot.findOneAndUpdate({}, { $set: { [updateField]: newState } }, { new: true }).lean();
        if (io) io.emit('bot-state-update', updated);
        log(`Estrategia ${strategy} cambió a: ${newState}`, 'info');
    } catch (error) {
        console.error(`[DB ERROR] No se pudo cambiar estado: ${error.message}`);
    }
}

// NUEVA: Actualizar datos específicos del ciclo Short
async function updateSStateData(fieldsToUpdate) {
    try {
        const dotNotationUpdate = Object.keys(fieldsToUpdate).reduce((acc, key) => {
            acc[`sStateData.${key}`] = fieldsToUpdate[key];
            return acc;
        }, {});
        await Autobot.findOneAndUpdate({}, { $set: dotNotationUpdate }); 
    } catch (error) {
        console.error(`[DB ERROR] Error en sStateData: ${error.message}`);
    }
}

async function updateLStateData(fieldsToUpdate) {
    try {
        const dotNotationUpdate = Object.keys(fieldsToUpdate).reduce((acc, key) => {
            acc[`lStateData.${key}`] = fieldsToUpdate[key];
            return acc;
        }, {});
        await Autobot.findOneAndUpdate({}, { $set: dotNotationUpdate }); 
    } catch (error) {
        console.error(`[DB ERROR] Error en lStateData: ${error.message}`);
    }
}

async function updateGeneralBotState(fieldsToUpdate) {
    try {
        return await Autobot.findOneAndUpdate({}, { $set: fieldsToUpdate }, { new: true, lean: true });
    } catch (error) {
        console.error(`[DB ERROR] Error en campos generales: ${error.message}`);
    }
}

// --- BALANCES ---
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
        lastAvailableUSDT: updated.lastAvailableUSDT, lastAvailableBTC: updated.lastAvailableBTC, source: apiSuccess ? 'API_SUCCESS' : 'CACHE_FALLBACK' 
    });
    return apiSuccess;
}

// --- COBERTURAS ---
async function recalculateDynamicCoverageLong(currentPrice, botState) {
    const { lbalance, config, lStateData, lnorder } = botState;
    if (botState.lstate === 'STOPPED' || !config.long.enabled || lbalance <= 0) {
        if (lnorder !== 0) await updateGeneralBotState({ lcoverage: 0, lnorder: 0 });
        return;
    }
    const purchaseUsdt = parseFloat(config.long.purchaseUsdt);
    const sizeVar = parseNumber(config.long.size_var) / 100;
    const currentOrderCount = lStateData.orderCountInCycle || 0;
    const nextOrderAmount = purchaseUsdt * Math.pow((1 + sizeVar), currentOrderCount);

    if (lbalance < nextOrderAmount) {
        if (lnorder !== 0) await updateGeneralBotState({ lcoverage: 0, lnorder: 0 });
        return;
    }
    const basePrice = (lStateData.ppc > 0) ? lStateData.ppc : currentPrice;
    const { coveragePrice: newCov, numberOfOrders: newN } = calculateLongCoverage(
        lbalance, basePrice, purchaseUsdt, parseNumber(config.long.price_var) / 100, sizeVar, currentOrderCount
    );
    if (newN !== lnorder || Math.abs(newCov - botState.lcoverage) > 0.01) {
        await updateGeneralBotState({ lcoverage: newCov, lnorder: newN });
    }
}

// NUEVA: Cobertura Short
async function recalculateDynamicCoverageShort(currentPrice, botState) {
    const { sbalance, config, sStateData, snorder } = botState;
    if (botState.sstate === 'STOPPED' || !config.short.enabled || sbalance <= 0) {
        if (snorder !== 0) await updateGeneralBotState({ scoverage: 0, snorder: 0 });
        return;
    }
    const purchaseUsdt = parseFloat(config.short.purchaseUsdt);
    const sizeVar = parseNumber(config.short.size_var) / 100;
    const currentOrderCount = sStateData.orderCountInCycle || 0;
    const nextOrderAmount = purchaseUsdt * Math.pow((1 + sizeVar), currentOrderCount);

    if (sbalance < nextOrderAmount) {
        if (snorder !== 0) await updateGeneralBotState({ scoverage: 0, snorder: 0 });
        return;
    }
    const basePrice = (sStateData.ppc > 0) ? sStateData.ppc : currentPrice;
    const { coveragePrice: newCov, numberOfOrders: newN } = calculateShortCoverage(
        sbalance, basePrice, purchaseUsdt, parseNumber(config.short.price_var) / 100, sizeVar, currentOrderCount
    );
    if (newN !== snorder || Math.abs(newCov - botState.scoverage) > 0.01) {
        await updateGeneralBotState({ scoverage: newCov, snorder: newN });
    }
}

// --- CICLO PRINCIPAL ---
async function botCycle(priceFromWebSocket, externalDependencies = {}) {
    try {
        let botState = await Autobot.findOne({}).lean();
        const currentPrice = parseFloat(priceFromWebSocket);
        if (!botState || isNaN(currentPrice) || currentPrice <= 0) {
            await syncFrontendState(currentPrice, botState);
            return;
        }

        const dependencies = {
            log, io, bitmartService, Autobot, currentPrice,
            availableUSDT: botState.lastAvailableUSDT, availableBTC: botState.lastAvailableBTC,
            botState, config: botState.config,
            updateBotState, updateLStateData, updateSStateData, updateGeneralBotState,
            syncFrontendState, ...externalDependencies
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies);

        // 1. Recalcular Coberturas
        if (botState.config.long.enabled) await recalculateDynamicCoverageLong(currentPrice, botState);
        if (botState.config.short.enabled) await recalculateDynamicCoverageShort(currentPrice, botState);
        
        botState = await Autobot.findOne({}).lean();
        dependencies.botState = botState;

        // 2. Consolidación (Long y Short)
        let needsRefresh = false;
        
        // Consolidación Long
        const lLastOrder = botState.lStateData?.lastOrder;
        if (lLastOrder?.side === 'buy') {
            if (await monitorLongBuy(botState, botState.config.symbol, log, updateLStateData, updateBotState, updateGeneralBotState)) needsRefresh = true;
        }
        if (lLastOrder?.side === 'sell') {
            if (await monitorAndConsolidateSell(botState, botState.config.symbol, log, updateLStateData, updateBotState, updateGeneralBotState)) needsRefresh = true;
        }

        // Consolidación Short (NUEVO)
        const sLastOrder = botState.sStateData?.lastOrder;
        if (sLastOrder?.side === 'sell') { // Apertura de Short
            if (await monitorShortSell(botState, botState.config.symbol, log, updateSStateData, updateBotState, updateGeneralBotState)) needsRefresh = true;
        }
        if (sLastOrder?.side === 'buy') { // Cierre de Short
            if (await monitorAndConsolidateShortBuy(botState, botState.config.symbol, log, updateSStateData, updateBotState, updateGeneralBotState)) needsRefresh = true;
        }

        if (needsRefresh) botState = await Autobot.findOne({}).lean();

        // 3. Ejecución de Estrategias
        if (botState.lstate !== 'STOPPED') await runLongStrategy();
        if (botState.sstate !== 'STOPPED') await runShortStrategy();

        await syncFrontendState(currentPrice, await Autobot.findOne({}).lean());
        
    } catch (error) {
        console.error(`[ERROR CRÍTICO] Fallo en el ciclo del bot: ${error.message}`);
    }
}

module.exports = {
    setIo, start: () => log('Bot Iniciado', 'success'), stop: () => log('Bot Detenido', 'warning'),
    log, botCycle, updateBotState, updateLStateData, updateSStateData, updateGeneralBotState,
    slowBalanceCacheUpdate, syncFrontendState
};