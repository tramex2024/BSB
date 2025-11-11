// BSB/server/autobotLogic.js (Sintaxis Corregida - Versión Final)

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/shortStrategy');

// 🛑 AÑADIDO: Consolidadores para órdenes que bloquean el ciclo
const { monitorAndConsolidate: monitorLongBuy } = require('./src/states/long/LongBuyConsolidator');
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
        await Autobot.findOneAndUpdate({}, { $set: fieldsToUpdate });
    } catch (error) {
        log(`Error al actualizar campos generales del estado del bot: ${error.message}`, 'error');
    }
}


// Aceptar un segundo parámetro para dependencias inyectadas (como getBotState)
async function botCycle(priceFromWebSocket, externalDependencies = {}) {
    try {
        // CRÍTICO: Recargar el botState ANTES de cada ciclo.
        let botState = await Autobot.findOne({});
        const currentPrice = parseFloat(priceFromWebSocket); 

        if (!botState || isNaN(currentPrice) || currentPrice <= 0) {
            if (priceFromWebSocket !== 'N/A') { 
                log(`Precio recibido no válido o botState no encontrado. Precio: ${priceFromWebSocket}`, 'warning');
            }
            return;
        }

        // Obtener saldos reales de la API
        let availableUSDT = 0;
        let availableBTC = 0;

        try {
            const balances = await bitmartService.getAvailableTradingBalances();
            // CORRECCIÓN DE ROBUSTEZ MEJORADA: Verificamos si balances es un objeto
            if (balances && typeof balances === 'object') {
                // Aseguramos que las variables son números o 0
                availableUSDT = parseFloat(balances.availableUSDT || balances.availableUsdt || 0); 
                availableBTC = parseFloat(balances.availableBTC || 0);
            } else {
                log(`Advertencia: La API de BitMart devolvió balances inválidos. Usando 0.00 como saldo real.`, 'warning');
            }
        } catch (error) {
            // Si el catch se ejecuta, disponibleUSDT debe ser 0.00
            availableUSDT = 0.00; 
            availableBTC = 0.00;
            log(`Advertencia: Falló la llamada a la API para obtener balances. Usando 0.00 como saldo real. Causa: ${error.message}`, 'warning');
        }
        
        // 🛑 INSERTAR ESTE LOG DE DIAGNÓSTICO AQUÍ
log(`[DIAGNÓSTICO AUTOBOT]: availableUSDT leido desde la API: ${availableUSDT.toFixed(2)}`, 'info');

        const dependencies = {
            log,
            io,
            bitmartService,
            Autobot,
            currentPrice, 
            availableUSDT, 
            availableBTC, 
            botState,
            
            config: botState.config,
            creds: {
                apiKey: process.env.BITMART_API_KEY,
                secretKey: process.env.BITMART_SECRET_KEY,
                memo: process.env.BITMART_API_MEMO
            },
            
            updateBotState, 
            updateLStateData, 
            updateSStateData, 
            updateGeneralBotState,
            
            // CRÍTICO: Inyectar la función de recarga del estado para LNoCoverage.js
            getBotState,
            
            // Incluir la dependencia externa
            ...externalDependencies 
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies); 

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
            // CRÍTICO: Recargar el botState si se procesó una orden y hubo una transición
            if (orderProcessed) {
                botState = await Autobot.findOne({});
                dependencies.botState = botState; // Actualizar dependencias
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
            // CRÍTICO: Recargar el botState si se procesó una orden y hubo una transición
            if (orderProcessed) {
                botState = await Autobot.findOne({});
                dependencies.botState = botState; // Actualizar dependencias
            }
        }


        // ==========================================================
        // 2. FASE DE EJECUCIÓN DE ESTRATEGIAS
        // ==========================================================

        let strategyExecuted = false;

        if (botState.lstate !== 'STOPPED') {
            // ✅ CORRECCIÓN DE SINTAXIS: Eliminamos el try/catch que estaba causando el error.
            await runLongStrategy();
            strategyExecuted = true;
        }
        
        if (botState.sstate !== 'STOPPED') {
            await runShortStrategy(); 
            strategyExecuted = true;
        }
        
        // Recargar el botState UNA VEZ si se ejecutó CUALQUIER estrategia.
        if (strategyExecuted) {
            botState = await Autobot.findOne({});
            dependencies.botState = botState; // Actualizar la referencia
            log('Estado del bot recargado tras ejecución de estrategia para sincronización.', 'debug');
        }
        
    } catch (error) {
        // Este catch ahora capturará el error toFixed, pero la lógica en LNoCoverage debe forzar la transición.
        log(`Error en el ciclo principal del bot: ${error.message}`, 'error');
    }
}

async function balanceCycle() {
    try {
        const balancesArray = await bitmartService.getBalance({
            apiKey: process.env.BITMART_API_KEY,
            secretKey: process.env.BITMART_SECRET_KEY,
            apiMemo: process.env.BITMART_API_MEMO
        });
        
        const usdtBalance = balancesArray.find(b => b.currency === 'USDT');
        const btcBalance = balancesArray.find(b => b.currency === 'BTC');

        if (!usdtBalance || !btcBalance) {
            log('No se pudieron obtener los balances de la cuenta.', 'error');
            return;
        }

        io.emit('wallet-balances', {
            USDT: { available: parseFloat(usdtBalance.available), frozen: parseFloat(usdtBalance.frozen) },
            BTC: { available: parseFloat(btcBalance.available), frozen: parseFloat(btcBalance.frozen) }
        });

    } catch (error) {
        log(`Error en el ciclo de balances: ${error.message}`, 'error');
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
    balanceCycle, 
    updateBotState,
    updateLStateData,
    updateSStateData,
    updateGeneralBotState
};