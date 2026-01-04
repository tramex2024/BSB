// Archivo: BSB/server/autobotLogic.js

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
const { monitorAndConsolidateShortBuy } = require('./src/au/states/short/ShortBuyConsolidator');

let io;
let isProcessing = false; // 🔒 El "Semáforo": Evita que el bot se pise a sí mismo

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

// --- NUEVA LÓGICA DE ACTUALIZACIÓN ATÓMICA (EFICIENCIA) ---

/**
 * Guarda todos los cambios acumulados de un solo golpe en la base de datos.
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

// Funciones auxiliares para anotar cambios en la "lista de pendientes" (changeSet)
function queueLStateUpdate(fields, changeSet) {
    Object.keys(fields).forEach(key => { changeSet[`lStateData.${key}`] = fields[key]; });
}

function queueSStateUpdate(fields, changeSet) {
    Object.keys(fields).forEach(key => { changeSet[`sStateData.${key}`] = fields[key]; });
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

// --- CICLO PRINCIPAL OPTIMIZADO ---
async function botCycle(priceFromWebSocket, externalDependencies = {}) {
    // Si el bot está ocupado procesando un precio, ignoramos el siguiente tick
    if (isProcessing) return;

    try {
        isProcessing = true; // Cerramos la puerta
        const changeSet = {}; // 📝 Lista de cambios para este ciclo

        let botState = await Autobot.findOne({}).lean();
        const currentPrice = parseFloat(priceFromWebSocket);
        if (!botState || isNaN(currentPrice) || currentPrice <= 0) {
            await syncFrontendState(currentPrice, botState);
            return;
        }

        // Preparamos las herramientas (dependencias) usando la nueva lógica de cambios
        const dependencies = {
            log, io, bitmartService, Autobot, currentPrice,
            availableUSDT: botState.lastAvailableUSDT, availableBTC: botState.lastAvailableBTC,
            botState, config: botState.config,
            // Estas funciones ahora NO escriben en la DB, solo anotan en changeSet
            updateBotState: async (val, strat) => { changeSet[strat === 'long' ? 'lstate' : 'sstate'] = val; },
            updateLStateData: async (fields) => queueLStateUpdate(fields, changeSet),
            updateSStateData: async (fields) => queueSStateUpdate(fields, changeSet),
            updateGeneralBotState: async (fields) => { Object.assign(changeSet, fields); },
            syncFrontendState, ...externalDependencies
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies);

        // 1. Recalcular Coberturas (Solo anotan en changeSet)
        // (La lógica interna de cobertura usará updateGeneralBotState inyectado arriba)

        // 2. Consolidación (Long y Short)
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

        // 3. Ejecución de Estrategias
        if (botState.lstate !== 'STOPPED') await runLongStrategy();
        if (botState.sstate !== 'STOPPED') await runShortStrategy();

        // 🚀 GUARDADO FINAL: Una sola escritura en la DB con todos los cambios acumulados
        const finalState = await commitChanges(changeSet);
        
        // Sincronizamos el frontend con el estado más reciente
        await syncFrontendState(currentPrice, finalState || botState);
        
    } catch (error) {
        console.error(`[ERROR CRÍTICO] Fallo en el ciclo del bot: ${error.message}`);
    } finally {
        isProcessing = false; // Abrimos la puerta para el siguiente tick
    }
}

module.exports = {
    setIo, start: () => log('Bot Iniciado', 'success'), stop: () => log('Bot Detenido', 'warning'),
    log, botCycle, slowBalanceCacheUpdate, syncFrontendState
};