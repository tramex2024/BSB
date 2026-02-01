/**
 * Archivo: BSB/server/autobotLogic.js
 * Motor de Ciclos - Sincronizado con Lógica Exponencial 2026
 * INTEGRACIÓN UNIFICADA: Long, Short & AI Strategy
 */

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/shortStrategy');
const { runAIStrategy, setDependencies: setAIDeps } = require('./src/aiStrategy'); 
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

let io;
let isProcessing = false; 
let lastCyclePrice = 0; 

function setIo(socketIo) { io = socketIo; }
function getLastPrice() { return lastCyclePrice; }

function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
    if (io) {
        io.emit('bot-log', { message, type });
    }
}

/**
 * ÚNICA FUENTE DE VERDAD PARA EL FRONTEND
 */
async function syncFrontendState(currentPrice, botState) {
    if (io && botState) {
        const priceToEmit = parseFloat(currentPrice || lastCyclePrice || 0);
        io.emit('bot-state-update', { 
            ...botState, 
            price: priceToEmit,
            serverTime: Date.now() 
        });
    }
}

/**
 * Persistencia Atómica Blindada
 */
async function commitChanges(changeSet, currentPrice) {
    try {
        if (Object.keys(changeSet).length === 0) return null;

        changeSet.lastUpdate = new Date();
        
        // 🛡️ Actualización directa sin lectura previa para evitar condiciones de carrera
        const updated = await Autobot.findOneAndUpdate(
            {}, 
            { $set: changeSet }, 
            { new: true, runValidators: true }
        ).lean();

        if (updated) {
            await syncFrontendState(currentPrice, updated);
        }
        return updated;
    } catch (error) {
        console.error(`❌ [DB ATOMIC ERROR]: ${error.message}`);
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

    if (updated) await syncFrontendState(lastCyclePrice, updated);
    return apiSuccess;
}

/**
 * ACTUALIZACIONES MANUALES (Merge Profundo)
 * Blindado para evitar el reseteo de parámetros a 0
 */
async function updateConfig(newConfig) {
    const currentPrice = lastCyclePrice;
    const currentBot = await Autobot.findOne({}).lean();
    if (!currentBot) return null;

    // 🛡️ Clonación profunda para evitar que el spread operator rompa objetos anidados
    const sanitizedConfig = JSON.parse(JSON.stringify(currentBot.config));

    // Merge manual campo por campo para asegurar integridad
    if (newConfig.long) Object.assign(sanitizedConfig.long, newConfig.long);
    if (newConfig.short) Object.assign(sanitizedConfig.short, newConfig.short);
    if (newConfig.ai) Object.assign(sanitizedConfig.ai, newConfig.ai);

    const bot = await Autobot.findOneAndUpdate({}, { 
        $set: { config: sanitizedConfig, lastUpdate: new Date() } 
    }, { new: true }).lean();

    log('⚙️ Parámetros de estrategia actualizados.', 'success');
    if (bot) await syncFrontendState(currentPrice, bot);
    return bot;
}

async function startSide(side, config) {
    const botState = await Autobot.findOne({}).lean();
    const cleanData = side === 'long' ? CLEAN_LONG_ROOT : CLEAN_SHORT_ROOT;
    
    // Si se provee una configuración parcial, hacer merge profundo con la existente
    const finalConfig = JSON.parse(JSON.stringify(botState.config));
    if (config && config[side]) {
        Object.assign(finalConfig[side], config[side]);
    }
    
    if (finalConfig[side]) {
        finalConfig[side].enabled = true;
    }

    const update = {
        ...cleanData, 
        [side === 'long' ? 'lstate' : 'sstate']: 'RUNNING',
        config: finalConfig
    };
    
    const bot = await Autobot.findOneAndUpdate({}, { $set: update }, { new: true }).lean();
    log(`🚀 Estrategia ${side.toUpperCase()} activada.`, 'success');
    await slowBalanceCacheUpdate();
    return bot;
}

async function stopSide(side) {
    const botState = await Autobot.findOne({}).lean();
    if (!botState) throw new Error("Bot no encontrado");

    const cleanData = side === 'long' ? CLEAN_LONG_ROOT : CLEAN_SHORT_ROOT;
    const stateField = side === 'long' ? 'lstate' : 'sstate'; 

    const newConfig = JSON.parse(JSON.stringify(botState.config));
    if (newConfig[side]) newConfig[side].enabled = false;

    const update = {
        ...cleanData,
        [stateField]: 'STOPPED',
        config: newConfig,
        lastUpdate: new Date()
    };
    
    const bot = await Autobot.findOneAndUpdate({}, { $set: update }, { new: true }).lean();
    if (bot) await syncFrontendState(lastCyclePrice, bot);

    log(`🛑 Estrategia ${side.toUpperCase()} detenida.`, 'warning');
    return bot;
}

/**
 * CICLO PRINCIPAL
 */
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
        setAIDeps(dependencies); 

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

        // 2. RECALCULAR INDICADORES
        if (botState.lstate !== 'STOPPED' && botState.config.long) {
            const activeLPPC = changeSet.lppc !== undefined ? changeSet.lppc : (botState.lppc || 0);
            if (activeLPPC > 0) {
                const { coveragePrice, numberOfOrders } = calculateLongCoverage(
                    botState.lbalance, currentPrice, botState.config.long.purchaseUsdt,
                    parseNumber(botState.config.long.price_var) / 100, 
                    parseNumber(botState.config.long.size_var), 
                    changeSet.locc || botState.locc || 0,
                    parseNumber(botState.config.long.price_step_inc)
                );
                changeSet.lcoverage = coveragePrice;
                changeSet.lnorder = numberOfOrders;
                changeSet.lprofit = calculatePotentialProfit(activeLPPC, (changeSet.lac || botState.lac || 0), currentPrice, 'long');
            }
        }

        if (botState.sstate !== 'STOPPED' && botState.config.short) {
            const activeSPPC = changeSet.sppc !== undefined ? changeSet.sppc : (botState.sppc || 0);
            if (activeSPPC > 0) {
                const { coveragePrice, numberOfOrders } = calculateShortCoverage(
                    botState.sbalance, currentPrice, botState.config.short.purchaseUsdt, 
                    parseNumber(botState.config.short.price_var) / 100, 
                    parseNumber(botState.config.short.size_var), 
                    changeSet.socc || botState.socc || 0,
                    parseNumber(botState.config.short.price_step_inc)
                );
                changeSet.scoverage = coveragePrice;
                changeSet.snorder = numberOfOrders;
                changeSet.sprofit = calculatePotentialProfit(activeSPPC, (changeSet.sac || botState.sac || 0), currentPrice, 'short');
            }
        }

        // 3. ESTRATEGIAS
        if (botState.lstate !== 'STOPPED') await runLongStrategy();
        if (botState.sstate !== 'STOPPED') await runShortStrategy();
        await runAIStrategy(); 

        // 4. PERSISTENCIA
        await commitChanges(changeSet, currentPrice);
        
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
    log, botCycle, slowBalanceCacheUpdate, syncFrontendState, getLastPrice, updateConfig, startSide, stopSide
};