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
    // 1. Extraemos lbalance (aquí estaba el problema, se usaba abajo como currentLBalance)
    const { lbalance, config, lnorder, lcoverage } = botState;
    const currentLBalance = parseFloat(lbalance || 0); // <--- DECLARACIÓN NECESARIA
    
    // Si el bot está detenido, no calculamos nada
    if (botState.lstate === 'STOPPED' || !config.long.enabled) return;

    const purchaseUsdt = parseFloat(config.long.purchaseUsdt);
    const sizeVar = parseNumber(config.long.size_var) / 100;
    const priceVar = parseNumber(config.long.price_var) / 100;
    
    const simulationOrderCount = 0; 

    // 2. Usamos currentLBalance para la validación
    if (currentLBalance < purchaseUsdt) {
        if (lnorder !== 0 || Math.abs(lcoverage - currentPrice) > 0.01) {
            await updateGeneralBotState({ 
                lcoverage: currentPrice, 
                lnorder: 0 
            });
        }
        return;
    }

    // 3. Cálculo dinámico
    const { coveragePrice: newCov, numberOfOrders: newN } = calculateLongCoverage(
        currentLBalance, // <--- Usamos la variable declarada
        currentPrice,
        purchaseUsdt, 
        priceVar, 
        sizeVar, 
        simulationOrderCount
    );
    
    // 4. Actualización con margen mínimo para evitar saturar DB
    if (newN !== lnorder || Math.abs(newCov - lcoverage) > 0.01) {
        await updateGeneralBotState({ lcoverage: newCov, lnorder: newN });
    }
}

/**
 * EL CORAZÓN DEL BOT: Se ejecuta con cada cambio de precio de Bitcoin.
 * Centraliza el flujo: Recalcular -> Consolidar -> Ejecutar -> Sincronizar.
 */
async function botCycle(priceFromWebSocket, externalDependencies = {}) {
    try {
        // 1. Carga inicial del estado y validación de precio
        let botState = await Autobot.findOne({}).lean();
        const currentPrice = parseFloat(priceFromWebSocket);
        
        if (!botState || isNaN(currentPrice) || currentPrice <= 0) {
            if (botState) await syncFrontendState(currentPrice, botState);
            return;
        }

        // 2. RECALCULO DINÁMICO (Dinamismo en tiempo real)
        // Calculamos la cobertura ANTES de cualquier otra lógica
        if (botState.config.long.enabled) {
            await recalculateDynamicCoverageLong(currentPrice, botState);
            
            // 🔥 REFRESH VITAL: Volvemos a leer de la DB para que las estrategias 
            // vean el nuevo lcoverage y lnorder actualizados.
            botState = await Autobot.findOne({}).lean(); 
        }

        // 3. PREPARACIÓN DE DEPENDENCIAS
        // Ahora las dependencias llevan el botState con el lcoverage RECIÉN calculado
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
            updateBotState, 
            updateLStateData, 
            updateGeneralBotState,
            syncFrontendState, 
            ...externalDependencies
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies);

        // 4. CONSOLIDACIÓN (Verificar órdenes en el Exchange)
        let needsRefresh = false;
        const lastOrder = botState.lStateData?.lastOrder;

        if (lastOrder?.side === 'buy') {
            if (await monitorLongBuy(botState, botState.config.symbol, log, updateLStateData, updateBotState, updateGeneralBotState)) {
                needsRefresh = true;
            }
        }
        if (lastOrder?.side === 'sell') {
            if (await monitorAndConsolidateSell(botState, botState.config.symbol, log, updateLStateData, updateBotState, updateGeneralBotState)) {
                needsRefresh = true;
            }
        }

        // Si una orden se completó, refrescamos el estado antes de la estrategia
        if (needsRefresh) {
            botState = await Autobot.findOne({}).lean();
            dependencies.botState = botState;
        }

        // 5. EJECUCIÓN DE ESTRATEGIA (Decidir compras/ventas)
        if (botState.lstate !== 'STOPPED') {
            await runLongStrategy();
        }

        if (botState.sstate !== 'STOPPED') {
            await runShortStrategy();
        }

        // 6. SINCRONIZACIÓN FINAL CON EL FRONTEND
        // Hacemos una última lectura para enviar la "foto" final de este ciclo a la web
        const finalState = await Autobot.findOne({}).lean();
        await syncFrontendState(currentPrice, finalState);
        
    } catch (error) {
        console.error(`[ERROR CRÍTICO] Fallo en el ciclo del bot: ${error.message}`);
        log(`Error en ciclo: ${error.message}`, 'error');
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