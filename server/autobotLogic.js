// BSB/server/autobotLogic.js (Integración LongSellConsolidator y Recálculo Dinámico)

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/shortStrategy');

// 🛑 NUEVAS IMPORTACIONES: Cálculo de Cobertura
const { calculateLongCoverage, parseNumber } = require('./autobotCalculations'); // Asumiendo que está un nivel arriba

// 🛑 AÑADIDO: Consolidadores para órdenes que bloquean el ciclo
const { monitorAndConsolidate: monitorLongBuy } = require('./src/states/long/LongBuyConsolidator');
const { monitorAndConsolidateSell } = require('./src/states/long/LongSellConsolidator'); 
const { monitorAndConsolidateShort: monitorShortSell } = require('./src/states/short/ShortSellConsolidator');

let io;

function setIo(socketIo) {
    io = socketIo;
}

function log(message, type = 'info') {
    if (io) {
        io.emit('bot-log', { message, type, timestamp: new Date().toISOString() });
    }
    console.log(`[BOT LOG]: ${message}`);
}

/**
 * Función para obtener el estado actual del bot directamente de la base de datos.
 */
async function getBotState() {
    return Autobot.findOne({});
}

/**
 * Función que actualiza únicamente el estado principal del bot (lstate/sstate) y EMITE AL FRONTEND.
 */
async function updateBotState(newState, strategy) {
    try {
        const updateField = strategy === 'long' ? 'lstate' : 'sstate';
        
        // Usamos $set para actualizar solo el campo de estado
        await Autobot.findOneAndUpdate({}, { $set: { [updateField]: newState } });
        
        // Emitimos el estado completo para sincronizar el Front-End.
        const updatedBotState = await Autobot.findOne({});
        if (io) {
            io.emit('bot-state-update', updatedBotState); 
        }
        
        log(`Estado de la estrategia ${strategy} actualizado a: ${newState}`, 'info');
    } catch (error) {
        log(`Error al actualizar el estado: ${error.message}`, 'error');
    }
}

/**
 * Función que actualiza PARCIALMENTE los datos del ciclo Long (lStateData) en la base de datos.
 */
async function updateLStateData(fieldsToUpdate) {
    try {
        // Mapeamos los campos para usar notación de punto 'lStateData.campo'
        const dotNotationUpdate = Object.keys(fieldsToUpdate).reduce((acc, key) => {
            acc[`lStateData.${key}`] = fieldsToUpdate[key];
            return acc;
        }, {});

        // Usamos $set para solo modificar los campos pasados dentro del subdocumento.
        await Autobot.findOneAndUpdate({}, { $set: dotNotationUpdate }); 
    } catch (error) {
        log(`Error al guardar lStateData: ${error.message}`, 'error');
    }
}

/**
 * Función que actualiza PARCIALMENTE los datos del ciclo Short (sStateData) en la base de datos.
 */
async function updateSStateData(fieldsToUpdate) {
    try {
        // Mapeamos los campos para usar notación de punto 'sStateData.campo'
        const dotNotationUpdate = Object.keys(fieldsToUpdate).reduce((acc, key) => {
            acc[`sStateData.${key}`] = fieldsToUpdate[key];
            return acc;
        }, {});

        // Usamos $set para solo modificar los campos pasados dentro del subdocumento.
        await Autobot.findOneAndUpdate({}, { $set: dotNotationUpdate }); 
    } catch (error) {
        log(`Error al guardar sStateData: ${error.message}`, 'error');
    }
}

/**
 * Función genérica para actualizar campos top-level y subdocumentos en el modelo Autobot.
 */
async function updateGeneralBotState(fieldsToUpdate) {
    try {
        // Usamos $set, podemos pasar campos de primer nivel Y campos con notación de punto
        // 1. Aplicar la actualización en la DB
        const updatedBot = await Autobot.findOneAndUpdate(
            {}, 
            { $set: fieldsToUpdate },
            { new: true } // 💡 CRÍTICO: Usar {new: true} para obtener el documento actualizado
        );
        
        // 2. EMITIR EL ESTADO COMPLETO al FRONTEND
        if (updatedBot && io) {
             io.emit('bot-state-update', updatedBot); // Utilizar el mismo evento de sincronización principal
        }
    } catch (error) {
        log(`Error al actualizar campos generales del estado del bot: ${error.message}`, 'error');
    }
}

/**
 * [CICLO LENTO - API] Llama a la API de BitMart (una vez cada 30-60s) 
 * y actualiza los balances reales de USDT y BTC en la base de datos (cache).
 */
async function slowBalanceCacheUpdate() {
    let availableUSDT = 0;
    let availableBTC = 0;
    let apiSuccess = false;

    try {
        // La única llamada a la API de BitMart
        const balancesArray = await bitmartService.getBalance();
        
        // 1. Extraer balances asumiendo que devuelve un ARRAY de objetos
        const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
        const btcBalance = balancesArray.find(b => b.currency === 'BTC');

        availableUSDT = parseFloat(usdtBalance?.available || 0);
        availableBTC = parseFloat(btcBalance?.available || 0);

        apiSuccess = true; // La API respondió con éxito
        
    } catch (error) {
        // Si hay un error, usamos la caché anterior.
        console.error("[SLOW BALANCE CACHE] Error al obtener balances de BitMart (Usando caché anterior/default):", error.message);
        
        // Si falla, leemos los valores anteriores de la DB para la emisión RÁPIDA (si existen)
        const currentBotState = await Autobot.findOne({});
        if (currentBotState) {
            availableUSDT = currentBotState.lastAvailableUSDT || 0;
            availableBTC = currentBotState.lastAvailableBTC || 0;
        }
    }

    try {
        // 2. Guardar el valor en los campos de caché de la base de datos
        const updatedBotState = await Autobot.findOneAndUpdate(
            {}, 
            {
                $set: { 
                    lastAvailableUSDT: availableUSDT, 
                    lastAvailableBTC: availableBTC,
                    lastBalanceCheck: new Date() 
                }
            },
            { new: true, upsert: true } 
        );

        // 3. Emitir los balances a la UI a través de Socket.IO
        if (updatedBotState && io) {
             io.sockets.emit('balance-real-update', { 
                lastAvailableUSDT: updatedBotState.lastAvailableUSDT,
                lastAvailableBTC: updatedBotState.lastAvailableBTC,
                lastBalanceCheck: updatedBotState.lastBalanceCheck,
                // Indicamos si la actualización fue de la API o de la caché (fallida)
                source: apiSuccess ? 'API_SUCCESS' : 'CACHE_FALLBACK' 
            });
        }
        
    } catch (dbError) {
        console.error("[SLOW BALANCE CACHE] Error crítico al guardar en la DB:", dbError.message);
    }
}

// ====================================================================
// FUNCIÓN DE RECALCULO DINÁMICO (NUEVA)
// ====================================================================
/**
 * Recalcula lcoverage y lnorder en cada ciclo para reflejar el capital restante
 * y la variación del precio de mercado (afectando el costo futuro de las órdenes).
 */
async function recalculateDynamicCoverageLong(currentPrice, botState) {
    try {
        const { lbalance, config, lStateData, lcoverage, lnorder } = botState;
        
        // Solo proceder si la estrategia Long está activa
        if (botState.lstate === 'STOPPED') return;

        // Si el lbalance es muy bajo o el purchaseUsdt es cero, reseteamos la cobertura
        if (parseFloat(lbalance) <= 0.01 || parseFloat(config.long.purchaseUsdt) <= 0) {
            if (lnorder !== 0 || lcoverage !== 0) {
                await updateGeneralBotState({ lcoverage: 0, lnorder: 0 });
                log('[LONG] Capital insuficiente o configuración inválida. Cobertura dinámica reseteada a 0.', 'warning');
            }
            return;
        }

        // Usar PPC como punto de ancla para el cálculo de caída, o el currentPrice si es la primera orden.
        const referencePrice = (lStateData.ppc || 0) > 0 ? lStateData.ppc : currentPrice;
        
        const priceVarDecimal = parseNumber(config.long.price_var) / 100;
        const sizeVarDecimal = parseNumber(config.long.size_var) / 100;
        const purchaseUsdt = parseFloat(config.long.purchaseUsdt);

        const { coveragePrice: newLCoverage, numberOfOrders: newLNOrder } = calculateLongCoverage(
            lbalance,      
            referencePrice, 
            purchaseUsdt,
            priceVarDecimal,
            sizeVarDecimal
        );

        // Actualizar la DB solo si hay un cambio significativo en el número de órdenes o precio de cobertura.
        if (newLNOrder !== lnorder || Math.abs(newLCoverage - lcoverage) > 0.01) {
            await updateGeneralBotState({
                lcoverage: newLCoverage,
                lnorder: newLNOrder,
            });
             log(`[LONG] Cobertura dinámica actualizada. LNOrder: ${lnorder} -> ${newLNOrder}, LCoverage: ${newLCoverage.toFixed(2)} USD.`, 'debug');
        }
    } catch (error) {
        log(`Error al recalcular cobertura dinámica: ${error.message}`, 'error');
    }
}


async function botCycle(priceFromWebSocket, externalDependencies = {}) {
    try {
        // CRÍTICO: Recargar el botState ANTES de cada ciclo.
        let botState = await Autobot.findOne({});
        const currentPrice = parseFloat(priceFromWebSocket); 
        let needsStateRefresh = false; // 💡 Nueva bandera de optimización

        if (!botState || isNaN(currentPrice) || currentPrice <= 0) {
            if (priceFromWebSocket !== 'N/A') { 
                log(`Precio recibido no válido o botState no encontrado. Precio: ${priceFromWebSocket}`, 'warning');
            }
            return;
        }

        // -------------------------------------------------------------
        // LECTURA DE LA CACHÉ Y DEFINICIÓN DE DEPENDENCIAS
        // -------------------------------------------------------------
        const availableUSDT = parseFloat(botState.lastAvailableUSDT || 0);
        const availableBTC = parseFloat(botState.lastAvailableBTC || 0);
        
        const dependencies = {
            log, io, bitmartService, Autobot, currentPrice, 
            availableUSDT, availableBTC, botState,
            config: botState.config,
            creds: {
                apiKey: process.env.BITMART_API_KEY, secretKey: process.env.BITMART_SECRET_KEY, memo: process.env.BITMART_API_MEMO
            },
            updateBotState, updateLStateData, updateSStateData, updateGeneralBotState, getBotState,
            ...externalDependencies 
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies); 

        // ==========================================================
        // 🛑 0. FASE DE RECALCULO DINÁMICO (NUEVO BLOQUE)
        // ==========================================================
        if (botState.config.long.enabled) {
            await recalculateDynamicCoverageLong(currentPrice, botState);
            
            // CRÍTICO: Recargamos el estado para obtener los nuevos lcoverage/lnorder
            // antes de la consolidación y la ejecución, si es que cambiaron.
            // Si el Recálculo fue exitoso y modificó la DB, necesitamos los nuevos valores.
            botState = await Autobot.findOne({});
            dependencies.botState = botState;
        }


        // ==========================================================
        // 1. FASE DE CONSOLIDACIÓN (CHECK DE ÓRDENES PENDIENTES)
        // ==========================================================
        
        // Ejecutar Consolidación Long (Monitorea órdenes BUY)
        if (botState.lStateData.lastOrder?.side === 'buy') {
            const orderProcessed = await monitorLongBuy(
                dependencies.botState, 
                dependencies.config.symbol, 
                dependencies.log, 
                dependencies.updateLStateData, 
                dependencies.updateBotState, 
                dependencies.updateGeneralBotState
            );
            if (orderProcessed) {
                needsStateRefresh = true; 
            }
        }
        
        // 💡 NUEVO BLOQUE: Ejecutar Consolidación Long (Monitorea órdenes SELL)
        if (botState.lStateData.lastOrder?.side === 'sell') {
            const orderProcessed = await monitorAndConsolidateSell( // 🎯 Llamada al nuevo módulo
                dependencies.botState, 
                dependencies.config.symbol, 
                dependencies.log, 
                dependencies.updateLStateData, 
                dependencies.updateBotState, 
                dependencies.updateGeneralBotState
            );
            if (orderProcessed) {
                needsStateRefresh = true; 
            }
        }
        
        // Ejecutar Consolidación Short (Monitorea órdenes SELL para apertura/cobertura)
        if (botState.sStateData.lastOrder?.side === 'sell') {
            const orderProcessed = await monitorShortSell(
                dependencies.botState, 
                dependencies.config.symbol, 
                dependencies.log, 
                dependencies.updateSStateData, 
                dependencies.updateBotState, 
                dependencies.updateGeneralBotState
            );
            if (orderProcessed) {
                needsStateRefresh = true; 
            }
        }

        // 💡 OPTIMIZACIÓN CRÍTICA: Recargar UNA SOLA VEZ si alguna consolidación ocurrió.
        if (needsStateRefresh) {
            botState = await Autobot.findOne({});
            dependencies.botState = botState; // Actualizar dependencias con el nuevo estado
            needsStateRefresh = false; // Reiniciar la bandera
        }


        // ==========================================================
        // 2. FASE DE EJECUCIÓN DE ESTRATEGIAS
        // ==========================================================

        let strategyExecuted = false;

        if (botState.lstate !== 'STOPPED') {
            await runLongStrategy();
            strategyExecuted = true;
        }
        
        if (botState.sstate !== 'STOPPED') {
            // await runShortStrategy(); 
            // strategyExecuted = true;
        }
        
        // Recargar el botState UNA VEZ si se ejecutó CUALQUIER estrategia.
        if (strategyExecuted) {
            botState = await Autobot.findOne({});
            dependencies.botState = botState; // Actualizar la referencia
        }
        
    } catch (error) {
        log(`Error en el ciclo principal del bot: ${error.message}`, 'error');
    }
}

async function start() {
    log('El bot se ha iniciado. El ciclo lo controla server.js', 'success');
}

async function stop() {
    log('El bot se ha detenido. El ciclo lo controla server.js', 'success');
}

module.exports = {
    setIo,
    start,
    stop,
    log,
    botCycle,    
    updateBotState,
    updateLStateData,
    updateSStateData,
    updateGeneralBotState,
    slowBalanceCacheUpdate,
    // Exportamos la función de recálculo si es necesaria en otras partes (opcional)
    recalculateDynamicCoverageLong 
};