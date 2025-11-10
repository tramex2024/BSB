// BSB/server/autobotLogic.js (FINALIZADO - Soporte Short y Long Completo)

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const { runLongStrategy, setDependencies: setLongDeps } = require('./src/longStrategy');
const { runShortStrategy, setDependencies: setShortDeps } = require('./src/shortStrategy'); // 💡 AÑADIDO

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
 * Utiliza notación de punto y $set para no sobrescribir todo el subdocumento.
 * @param {object} fieldsToUpdate - Objeto con { campo: nuevoValor, ... } (ej: { ppc: 120000, ac: 0.0001 })
 */
async function updateLStateData(fieldsToUpdate) {
    try {
        // Mapeamos los campos para usar notación de punto 'lStateData.campo'
        const dotNotationUpdate = Object.keys(fieldsToUpdate).reduce((acc, key) => {
            acc[`lStateData.${key}`] = fieldsToUpdate[key];
            return acc;
        }, {});

        // 🛑 CAMBIO CLAVE: Usamos $set para solo modificar los campos pasados dentro del subdocumento.
        await Autobot.findOneAndUpdate({}, { $set: dotNotationUpdate }); 
    } catch (error) {
        log(`Error al guardar lStateData: ${error.message}`, 'error');
    }
}

/**
 * Función que actualiza PARCIALMENTE los datos del ciclo Short (sStateData) en la base de datos.
 * Utiliza notación de punto y $set para no sobrescribir todo el subdocumento.
 * @param {object} fieldsToUpdate - Objeto con { campo: nuevoValor, ... }
 */
async function updateSStateData(fieldsToUpdate) {
    try {
        // Mapeamos los campos para usar notación de punto 'sStateData.campo'
        const dotNotationUpdate = Object.keys(fieldsToUpdate).reduce((acc, key) => {
            acc[`sStateData.${key}`] = fieldsToUpdate[key];
            return acc;
        }, {});

        // 🛑 CAMBIO CLAVE: Usamos $set para solo modificar los campos pasados dentro del subdocumento.
        await Autobot.findOneAndUpdate({}, { $set: dotNotationUpdate }); 
    } catch (error) {
        log(`Error al guardar sStateData: ${error.message}`, 'error');
    }
}

/**
 * Función genérica para actualizar campos top-level en el modelo Autobot (usado para LBalance/SBalance, etc.).
 * Esta función AHORA también acepta campos con notación de punto para subdocumentos.
 * @param {object} fieldsToUpdate - Objeto con { campo: nuevoValor, ... } o { 'subdocumento.campo': nuevoValor, ... }
 */
async function updateGeneralBotState(fieldsToUpdate) {
    try {
        // Al usar $set, podemos pasar campos de primer nivel Y campos con notación de punto
        // (ej: { ltprice: 100, 'lStateData.pc': 50 })
        await Autobot.findOneAndUpdate({}, { $set: fieldsToUpdate });
    } catch (error) {
        log(`Error al actualizar campos generales del estado del bot: ${error.message}`, 'error');
    }
}


// 🛑 CORRECCIÓN: Aceptar un segundo parámetro para dependencias inyectadas (como getBotState)
async function botCycle(priceFromWebSocket, externalDependencies = {}) {
    try {
        // 🛑 CRÍTICO: Recargar el botState ANTES de cada ciclo. (CORRECTO)
        let botState = await Autobot.findOne({});
        const currentPrice = parseFloat(priceFromWebSocket); 

        if (!botState || isNaN(currentPrice) || currentPrice <= 0) {
            if (priceFromWebSocket !== 'N/A') { 
                log(`Precio recibido no válido o botState no encontrado. Precio: ${priceFromWebSocket}`, 'warning');
            }
            return;
        }

        // Obtener saldos reales de la API
        const { availableUSDT, availableBTC } = await bitmartService.getAvailableTradingBalances();

        const dependencies = {
            log,
            io,
            bitmartService,
            Autobot,
            currentPrice, 
            availableUSDT, 
            availableBTC, 
            // 🛑 Usar el botState recién cargado
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
            
            // 🛑 CORRECCIÓN CLAVE: Incluir la dependencia externa si se pasó (como getBotState)
            ...externalDependencies 
        };

        setLongDeps(dependencies);
        setShortDeps(dependencies); // 💡 AÑADIDO: Inyectar dependencias en el flujo Short

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
            // 🛑 CRÍTICO: Recargar el botState si se procesó una orden y hubo una transición
            if (orderProcessed) {
                botState = await Autobot.findOne({});
                dependencies.botState = botState; // Actualizar dependencias
            }
        }
        
        // 🛑 NUEVO: Ejecutar Consolidación Short (Monitorea órdenes SELL para apertura/cobertura)
        if (botState.sStateData.lastOrder?.side === 'sell') {
            const orderProcessed = await monitorShortSell(
                dependencies.botState, 
                dependencies.config.symbol, 
                dependencies.log, 
                dependencies.updateSStateData, 
                dependencies.updateBotState, 
                dependencies.updateGeneralBotState
            );
            // 🛑 CRÍTICO: Recargar el botState si se procesó una orden y hubo una transición
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
            await runLongStrategy();
            strategyExecuted = true;
        }
        
        // 🛑 BLOQUE DE RECARGA ELIMINADO DE AQUÍ

        if (botState.sstate !== 'STOPPED') {
            // 🛑 DESCOMENTADO/AÑADIDO: Ejecutar la lógica Short (Evalúa DCA o TP Buy)
            await runShortStrategy(); 
            strategyExecuted = true;
        }
        
        // ✅ AÑADIDO: Recargar el botState UNA VEZ si se ejecutó CUALQUIER estrategia.
        // Esto captura la actualización de lastOrder hecha en LongOrderManager.js o ShortOrderManager.js
        if (strategyExecuted) {
            botState = await Autobot.findOne({});
            dependencies.botState = botState; // Actualizar la referencia
            log('Estado del bot recargado tras ejecución de estrategia para sincronización.', 'debug');
        }
        
    } catch (error) {
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