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

// 🛑 Mantén la función log aquí, es la forma correcta si está en el mismo archivo.
function log(message, type = 'info') {
    if (io) {
        io.emit('bot-log', { message, type, timestamp: new Date().toISOString() });
    }
    console.log(`[BOT LOG]: ${message}`);
}

/**
 * Función genérica para emitir el estado actual del bot, incluyendo el precio
 * actual del WebSocket, para sincronizar la interfaz de usuario.
 */
async function syncFrontendState(currentPrice, botState) {
    if (io && botState) {
        // Obtenemos el estado más fresco de la DB si botState es null/viejo
        const stateToEmit = botState || await getBotState();
        
        // Emitimos el objeto completo, incluyendo el precio actual
        io.emit('full-state-sync', {
            botState: stateToEmit,
            currentPrice: currentPrice,
            timestamp: new Date().toISOString()
        });
    }
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
        
        // La emisión se maneja ahora principalmente a través de syncFrontendState en botCycle
        const updatedBotState = await Autobot.findOne({});
        if (io) {
             io.emit('bot-state-update', updatedBotState); // Se mantiene esta emisión para eventos específicos de cambio de estado
        }
        
        log(`Estado de la estrategia ${strategy} actualizado a: ${newState}`, 'info');
    } catch (error) {
        // 🛑 CORRECCIÓN DE BLINDAJE: Usar console.error
        console.error(`[DB ERROR] Fallo al actualizar el estado: ${error.message}`);
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
        // 🛑 CORRECCIÓN DE BLINDAJE: Usar console.error
        console.error(`[DB ERROR] Fallo al guardar lStateData: ${error.message}`);
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
        // 🛑 CORRECCIÓN DE BLINDAJE: Usar console.error
        console.error(`[DB ERROR] Fallo al guardar sStateData: ${error.message}`);
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
        
        // 🛑 Eliminamos la emisión 'bot-state-update' de aquí. La sincronización completa 
        // se hará al final del botCycle mediante syncFrontendState.
        return updatedBot;
    } catch (error) {
        // 🛑 CORRECCIÓN DE BLINDAJE: Usar console.error
        console.error(`[DB ERROR] Fallo al actualizar campos generales del estado del bot: ${error.message}`);
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
// FUNCIÓN DE RECALCULO DINÁMICO
// ====================================================================

/**
 * FUNCIÓN DE RECALCULO DINÁMICO (CORREGIDA)
 * Calcula la capacidad de cobertura real basándose en el nivel actual del ciclo.
 */
async function recalculateDynamicCoverageLong(currentPrice, botState) {
    try {
        const { lbalance, config, lStateData, lcoverage, lnorder } = botState;
        
        // Solo proceder si la estrategia Long está activa
        if (botState.lstate === 'STOPPED') return;

        // 1. Preparación de parámetros
        const purchaseUsdt = parseFloat(config.long.purchaseUsdt);
        const sizeVarDecimal = parseNumber(config.long.size_var) / 100;
        const priceVarDecimal = parseNumber(config.long.price_var) / 100;
        const orderCount = lStateData.orderCountInCycle || 0;

        // 2. 🎯 CÁLCULO CRÍTICO: ¿Cuánto cuesta la PRÓXIMA orden que toca?
        // Fórmula: Base * (1 + Incremento)^OrdenesRealizadas
        // En tu caso: 6 * (1 + 1)^3 = 6 * 8 = 48 USDT
        const nextOrderAmount = purchaseUsdt * Math.pow((1 + sizeVarDecimal), orderCount);

        // 3. VERIFICACIÓN DE SEGURIDAD (Si el capital no alcanza para la orden que SIGUE)
        if (parseFloat(lbalance) < nextOrderAmount) {
            // Si el balance (8.03) es menor que la orden que sigue (48), lnorder DEBE SER 0.
            if (lnorder !== 0) {
                await updateGeneralBotState({ lcoverage: currentPrice, lnorder: 0 }); 
                log(`[LONG] Capacidad agotada. Balance (${lbalance.toFixed(2)}) insuficiente para orden #${orderCount + 1} (${nextOrderAmount.toFixed(2)}). LNOrder reseteado a 0.`, 'warning');
            }
            return;
        }

        // 4. Determinar precio de referencia (PPC o Precio Actual)
        const referencePrice = (lStateData.ppc || 0) > 0 ? lStateData.ppc : currentPrice;

        // 5. Ejecución del cálculo de cobertura proyectada
        // Le pasamos 'nextOrderAmount' para que empiece a simular desde el costo real actual.
        const { coveragePrice: newLCoverage, numberOfOrders: newLNOrder } = calculateLongCoverage(
            lbalance,       
            referencePrice, 
            nextOrderAmount,  
            priceVarDecimal,
            sizeVarDecimal
        );
        
        // 6. Persistencia si hubo cambios
        if (newLNOrder !== lnorder || Math.abs(newLCoverage - lcoverage) > 0.01) {
            await updateGeneralBotState({
                lcoverage: newLCoverage,
                lnorder: newLNOrder,
            });
            log(`[LONG] Recálculo: Capacidad para ${newLNOrder} órdenes más. Cobertura hasta: ${newLCoverage.toFixed(2)}`, 'debug');
        }

    } catch (error) {
        console.error(`[CALCULO ERROR] Error en el recálculo dinámico: ${error.message}`);
    }
}

async function botCycle(priceFromWebSocket, externalDependencies = {}) {
    try {
        // CRÍTICO: Recargar el botState ANTES de cada ciclo.
        let botState = await Autobot.findOne({});
        const currentPrice = parseFloat(priceFromWebSocket); 
        let needsStateRefresh = false; // 💡 Nueva bandera de optimización

        // 🛑 BLOQUE CORREGIDO: Verificación inicial y salida (CRÍTICO)
        if (!botState || isNaN(currentPrice) || currentPrice <= 0) {
            if (priceFromWebSocket !== 'N/A') { 
                // Usamos console.log como alternativa si log es el problema inicial.
                if (typeof log === 'function') {
                    log(`Precio recibido no válido o botState no encontrado. Precio: ${priceFromWebSocket}`, 'warning');
                } else {
                    console.log(`[BOT LOG (WARNING)]: Precio recibido no válido o botState no encontrado. Precio: ${priceFromWebSocket}`);
                }
            }
            // 🛑 Sincronización final y SALIDA del ciclo.
            await syncFrontendState(currentPrice, botState);
            return; 
        } // 🛑 LLAVE DE CIERRE FALTANTE

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
            // 🛑 Añadimos la nueva función de sincronización a las dependencias
            syncFrontendState,
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
        
        // ==========================================================
        // 3. FASE DE SINCRONIZACIÓN FINAL
        // ==========================================================
        // 🛑 Emitir el estado FINAL del ciclo, incluyendo el precio, al frontend.
        await syncFrontendState(currentPrice, botState);
        
    } catch (error) {
        // 🛑 BLINDAJE: Usar console.error directamente
        console.error(`[ERROR FATAL EN BOTCYCLE] El bot falló: ${error.message}`);
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
    recalculateDynamicCoverageLong,
    syncFrontendState
};