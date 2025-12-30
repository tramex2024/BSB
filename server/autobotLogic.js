// BSB/server/autobotLogic.js

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/au/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/au/shortStrategy');

// Importaciones de Cálculos
const { calculateLongCoverage, parseNumber } = require('./autobotCalculations');

// Consolidadores (Módulos que vigilan si una orden se completó en el exchange)
const { monitorAndConsolidate: monitorLongBuy } = require('./src/au/states/long/LongBuyConsolidator');
const { monitorAndConsolidateSell } = require('./src/au/states/long/LongSellConsolidator'); 
const { monitorAndConsolidateShort: monitorShortSell } = require('./src/au/states/short/ShortSellConsolidator');

let io;

/**
 * Configura el canal de comunicación en tiempo real (Socket.io)
 */
function setIo(socketIo) {
    io = socketIo;
}

/**
 * Envía mensajes a la consola del servidor y a la pantalla del usuario
 */
function log(message, type = 'info') {
    if (io) {
        io.emit('bot-log', { message, type, timestamp: new Date().toISOString() });
    }
    console.log(`[${type.toUpperCase()}]: ${message}`);
}

/**
 * Sincroniza TODO el estado del bot con la página web
 */
async function syncFrontendState(currentPrice, botState) {
    if (io && botState) {
        // Usamos el mismo nombre de evento que el server.js para que el frontend lo entienda
        io.emit('bot-state-update', botState); 
        
        // Opcional: enviamos el precio por separado si el gráfico lo necesita
        io.emit('marketData', { price: currentPrice });
    }
}

/**
 * Cambia el estado (ej: de STOPPED a RUNNING) y avisa a la web
 */
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

/**
 * Actualiza datos específicos del ciclo Long (compras, promedios, etc)
 */
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

/**
 * Actualiza campos generales en la base de datos
 */
async function updateGeneralBotState(fieldsToUpdate) {
    try {
        return await Autobot.findOneAndUpdate({}, { $set: fieldsToUpdate }, { new: true, lean: true });
    } catch (error) {
        console.error(`[DB ERROR] Error en campos generales: ${error.message}`);
    }
}

/**
 * [CICLO LENTO] Consulta balances reales en BitMart cada X segundos
 */
async function slowBalanceCacheUpdate() {
    let availableUSDT = 0;
    let availableBTC = 0;
    let apiSuccess = false;

    try {
        const balancesArray = await bitmartService.getBalance();
        const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
        const btcBalance = balancesArray.find(b => b.currency === 'BTC');

        availableUSDT = parseFloat(usdtBalance?.available || 0);
        availableBTC = parseFloat(btcBalance?.available || 0);
        apiSuccess = true;
    } catch (error) {
        console.error("[BALANCE] Error BitMart API, usando última copia guardada.");
        const current = await Autobot.findOne({}).lean();
        availableUSDT = current?.lastAvailableUSDT || 0;
        availableBTC = current?.lastAvailableBTC || 0;
    }

    const updated = await Autobot.findOneAndUpdate({}, {
        $set: { 
            lastAvailableUSDT: availableUSDT, 
            lastAvailableBTC: availableBTC, 
            lastBalanceCheck: new Date() 
        }
    }, { new: true, upsert: true, lean: true });

    if (io) {
        io.sockets.emit('balance-real-update', { 
            lastAvailableUSDT: updated.lastAvailableUSDT,
            lastAvailableBTC: updated.lastAvailableBTC,
            source: apiSuccess ? 'API_SUCCESS' : 'CACHE_FALLBACK' 
        });
    }
    return apiSuccess;
}

/**
 * Calcula cuántas órdenes de seguridad puedes pagar con tu saldo actual
 */
async function recalculateDynamicCoverageLong(currentPrice, botState) {
    const { lbalance, config, lnorder, lcoverage } = botState;
    
    // Si el bot está detenido, no calculamos nada
    if (botState.lstate === 'STOPPED' || !config.long.enabled) return;

    const purchaseUsdt = parseFloat(config.long.purchaseUsdt);
    const sizeVar = parseNumber(config.long.size_var) / 100;
    const priceVar = parseNumber(config.long.price_var) / 100;
    
    // IMPORTANTE: El conteo de órdenes para el cálculo de cobertura 
    // siempre empieza desde 0 porque es una simulación desde "ahora"
    const simulationOrderCount = 0; 

    // 1. Calculamos el costo de la primera orden de la simulación
    const firstOrderAmount = purchaseUsdt;

    // --- ESCENARIO: SIN SALDO PARA LA PRIMERA ORDEN ---
    if (lbalance < firstOrderAmount) {
        if (lnorder !== 0 || Math.abs(lcoverage - currentPrice) > 0.01) {
            await updateGeneralBotState({ 
                lcoverage: currentPrice, 
                lnorder: 0 
            });
        }
        return;
    }

    // --- ESCENARIO: CÁLCULO DINÁMICO DESDE EL PRECIO ACTUAL ---
    // Eliminamos el PPC. Solo importa el currentPrice.
    const { coveragePrice: newCov, numberOfOrders: newN } = calculateLongCoverage(
        lbalance, 
        currentPrice, // <--- Única base posible
        purchaseUsdt, 
        priceVar, 
        sizeVar, 
        simulationOrderCount
    );
    
    // Actualizamos la base de datos siempre que el precio cambie (Tiempo Real)
    // Usamos un margen pequeño (ej: 0.10 USDT) para no saturar la DB con micro-centavos
    if (newN !== lnorder || Math.abs(newCov - lcoverage) > 0.10) {
        await updateGeneralBotState({ lcoverage: newCov, lnorder: newN });
    }
}

/**
 * EL CORAZÓN DEL BOT: Se ejecuta con cada cambio de precio de Bitcoin
 */
async function botCycle(priceFromWebSocket, externalDependencies = {}) {
    try {
        let botState = await Autobot.findOne({}).lean();
        const currentPrice = parseFloat(priceFromWebSocket);
        
        if (!botState || isNaN(currentPrice) || currentPrice <= 0) {
            await syncFrontendState(currentPrice, botState);
            return;
        }

        // Preparamos las herramientas para las estrategias
        const dependencies = {
            log, io, bitmartService, Autobot, currentPrice,
            availableUSDT: botState.lastAvailableUSDT,
            availableBTC: botState.lastAvailableBTC,
            botState, config: botState.config,
            updateBotState, updateLStateData, updateGeneralBotState,
            syncFrontendState, ...externalDependencies
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies);

        // 1. Recalcular cobertura (¿Cuánto dinero nos queda para promediar?)
        if (botState.config.long.enabled) {
            await recalculateDynamicCoverageLong(currentPrice, botState);
            botState = await Autobot.findOne({}).lean(); // Refrescar datos
            dependencies.botState = botState;
        }

        // 2. Consolidación (¿Se llenó la orden que enviamos hace un momento?)
        let needsRefresh = false;
        const lastOrder = botState.lStateData?.lastOrder;

        if (lastOrder?.side === 'buy') {
            if (await monitorLongBuy(botState, botState.config.symbol, log, updateLStateData, updateBotState, updateGeneralBotState)) needsRefresh = true;
        }
        if (lastOrder?.side === 'sell') {
            if (await monitorAndConsolidateSell(botState, botState.config.symbol, log, updateLStateData, updateBotState, updateGeneralBotState)) needsRefresh = true;
        }

        if (needsRefresh) botState = await Autobot.findOne({}).lean();

        // 3. Ejecución de Estrategia (Decidir si comprar o vender ahora)
        if (botState.lstate !== 'STOPPED') {
            await runLongStrategy();
        }

        // Finalizar informando a la web
        await syncFrontendState(currentPrice, await Autobot.findOne({}).lean());
        
    } catch (error) {
        console.error(`[ERROR CRÍTICO] Fallo en el ciclo del bot: ${error.message}`);
    }
}

module.exports = {
    setIo,
    start: () => log('Bot Iniciado', 'success'),
    stop: () => log('Bot Detenido', 'warning'),
    log,
    botCycle,
    updateBotState,
    updateLStateData,
    updateGeneralBotState,
    slowBalanceCacheUpdate,
    recalculateDynamicCoverageLong,
    syncFrontendState
};