// Archivo BSB/server/src/utils/dataManager.js

const { log } = require('../logger'); 
// CORRECCIÓN DE RUTA Y NOMBRE DE ARCHIVO
const { calculateNextTarget, calculateNextCoverage } = require('../../autobotCalculations'); 

/**
 * Maneja una compra exitosa (total o parcial), actualiza la posición del bot
 * (PPC, AC, lastExecutionPrice), y pasa al estado de gestión de posición (BUYING).
 *
 * @param {object} botState - Estado actual del bot (leído antes de la ejecución de la orden).
 * @param {object} orderDetails - Detalles de la orden ejecutada (de getOrderDetail).
 * @param {function} updateGeneralBotState - Función para actualizar el estado general (LBalance).
 * @param {function} log - Función de logging.
 */
// -----------------------------------------------------------------------------------
// INICIO DE LA FUNCIÓN handleSuccessfulBuy CON LOGS DE AUDITORÍA
// -----------------------------------------------------------------------------------
async function handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState, log) {
    // Importamos Autobot y otras utilidades que necesitamos para la verificación en DB
    const Autobot = require('../../models/Autobot'); 

    // --- 1. EXTRACCIÓN Y VALIDACIÓN DE DATOS DE LA ORDEN ---
    
    // (Mantengo las claves originales que tienes para no modificar otros archivos)
    const executedQty = parseFloat(orderDetails.filledSize || 0);     // Cantidad de activo comprada
    const executedAvgPrice = parseFloat(orderDetails.priceAvg || 0); // Precio promedio de ejecución real
    
    const intendedUsdtSpent = parseFloat(botState.lStateData.lastOrder?.usdt_amount || 0); 
    const actualUsdtSpent = parseFloat(orderDetails.notional || 0); 

    const finalExecutionPrice = executedAvgPrice > 0 ? executedAvgPrice : parseFloat(orderDetails.price || 0);
    
    if (executedQty <= 0 || finalExecutionPrice <= 0) {
        log('Error de procesamiento de compra: handleSuccessfulBuy llamado con ejecución o precio cero. Limpiando lastOrder.', 'error');
        // Lógica de manejo de fallos... (sin cambios aquí)
        await Autobot.findOneAndUpdate({}, { 'lStateData.lastOrder': null });
        return; 
    }

    // --- 2. CÁLCULO DEL NUEVO PRECIO PROMEDIO DE COMPRA (PPC) y AC ---

    const currentTotalQty = parseFloat(botState.lStateData.ac || 0); 
    const currentPriceMean = parseFloat(botState.lStateData.ppc || 0); 
    const currentOrderCount = parseInt(botState.lStateData.orderCountInCycle || 0); 
    
    const currentTotalCost = currentTotalQty * currentPriceMean;
    const newOrderCost = executedQty * finalExecutionPrice; 
    
    const newTotalQty = currentTotalQty + executedQty;

    let newPPC = currentPriceMean; 
    
    if (newTotalQty > 0) {
        newPPC = (currentTotalCost + newOrderCost) / newTotalQty;
        if (isNaN(newPPC)) newPPC = currentPriceMean; 
    }

    // --- 3. GESTIÓN DEL CAPITAL RESTANTE (LBalance) ---

    const usdtToRefund = intendedUsdtSpent - actualUsdtSpent;

    if (usdtToRefund > 0.01) { 
        const currentLBalance = parseFloat(botState.lbalance || 0);
        const newLBalance = currentLBalance + usdtToRefund;
        log(`Devolviendo ${usdtToRefund.toFixed(2)} USDT al LBalance debido a ejecución parcial. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');
        await updateGeneralBotState({ lbalance: newLBalance }); 
    }
    
    // --- 4. ACTUALIZAR ESTADO DE LA BASE DE DATOS (Con Logs de Auditoría) ---

    const nextState = 'BUYING'; 
    
    // Aplicamos los cambios al objeto de Mongoose en memoria
    botState.lstate = nextState;
    botState.lStateData.ac = newTotalQty;       
    botState.lStateData.ppc = newPPC;           
    botState.lStateData.lastExecutionPrice = finalExecutionPrice; 
    botState.lStateData.orderCountInCycle = currentOrderCount + 1; 
    botState.lStateData.lastOrder = null;       
    
    // 🛑 LOG 1: Contenido del documento ANTES de llamar a .save()
    log(`[AUDITORÍA 1/3] -> ANTES de guardar. PPC a guardar: ${botState.lStateData.ppc.toFixed(2)}, AC a guardar: ${botState.lStateData.ac.toFixed(8)}, LState: ${botState.lstate}`, 'debug');

    // Persistencia a la DB
    await botState.save(); 

    // 🛑 LOG 2: Contenido del documento DESPUÉS de que .save() regresa
    log(`[AUDITORÍA 2/3] -> DESPUÉS de guardar (Objeto en memoria). PPC: ${botState.lStateData.ppc.toFixed(2)}, AC: ${botState.lStateData.ac.toFixed(8)}, LState: ${botState.lstate}`, 'debug');
    
    // 🛑 LOG 3: Verificación directa, lectura atómica desde la DB
    const verificationBot = await Autobot.findOne({});
    if (verificationBot) {
        log(`[AUDITORÍA 3/3] -> VERIFICACIÓN EN DB. PPC leído: ${verificationBot.lStateData.ppc.toFixed(2)}, AC leído: ${verificationBot.lStateData.ac.toFixed(8)}, LState: ${verificationBot.lstate}`, 'debug');
    } else {
        log('[AUDITORÍA 3/3] -> ERROR: No se encontró el documento de Autobot para la verificación.', 'error');
    }


    log(`[LONG] Orden confirmada. Nuevo PPC: ${newPPC.toFixed(2)}, Qty Total (AC): ${newTotalQty.toFixed(8)}. Precio de ejecución: ${finalExecutionPrice.toFixed(2)}. Transicionando a ${nextState}.`, 'info');
}
// -----------------------------------------------------------------------------------
// FIN DE LA FUNCIÓN handleSuccessfulBuy CON LOGS DE AUDITORÍA
// -----------------------------------------------------------------------------------


// Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { handleSuccessfulSell: LSellingHandler } = require('../states/long/LSelling');
    await LSellingHandler(botStateObj, orderDetails, dependencies);
}

// Lógica de reseteo (asume que existe)
async function resetAndInitializeBot(log) {
    const Autobot = require('../../models/Autobot'); 
    
    const currentBot = await Autobot.findOne({});
    
    const config = currentBot ? currentBot.config : { /* ... tus valores por defecto ... */ }; 
    const initialLBalance = config.long.amountUsdt || 0; 
    const totalProfit = currentBot ? currentBot.total_profit : 0; 
    
    await Autobot.deleteMany({});
    log('Documento Autobot eliminado completamente.', 'error');
    
    const newBotData = {
        "lstate": "RUNNING", 
        "sstate": "RUNNING",
        "config": config,
        "total_profit": totalProfit,
        "lbalance": initialLBalance, 
        "sbalance": config.short.amountBtc || 0, 
        "lStateData": { "ppc": 0, "ac": 0, "ppv": 0, "av": 0, "orderCountInCycle": 0, "lastOrder": null, "pm": 0, "pc": 0, "requiredCoverageAmount": 0, "nextCoveragePrice": 0 },
        "sStateData": { "ppc": 0, "ac": 0, "ppv": 0, "av": 0, "orderCountInCycle": 0, "lastOrder": null, "pm": 0, "pc": 0, "requiredCoverageAmount": 0, "nextCoveragePrice": 0 },
        "lcycle": 0, "lnorder": 0, "ltprice": 0,
        "scycle": 0, "snorder": 0, "stprice": 0,
    };
    
    const newAutobot = new Autobot(newBotData);
    await newAutobot.save();
    
    log(`Documento Autobot creado. LBalance inicializado a ${initialLBalance} USDT. Listo para operar.`, 'info');
}

module.exports = {
    handleSuccessfulBuy,
    handleSuccessfulSell,
    resetAndInitializeBot
};
