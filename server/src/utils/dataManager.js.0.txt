// Archivo BSB/server/src/utils/dataManager.js (CORRECCIÓN FINAL - SÓLO EXPORTACIÓN)

const { log } = require('../logger'); 
// ✅ Las importaciones de cálculo son correctas
const { 
    calculateLongTargets, 
    calculateNextTarget, 
    calculateNextCoverage 
} = require('../../autobotCalculations'); 
const Autobot = require('../../models/Autobot'); // Importar Mongoose Model aquí para uso interno

/**
 * Maneja una compra exitosa (total o parcial), actualiza la posición del bot
 * (PPC, AC, lastExecutionPrice), y pasa al estado de gestión de posición (BUYING).
 *
 * (Cuerpo de la función handleSuccessfulBuy, sin cambios)
 */
async function handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState, log) {
    // --- 1. EXTRACCIÓN Y VALIDACIÓN DE DATOS DE LA ORDEN ---
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);      
    const executedAvgPrice = parseFloat(orderDetails.priceAvg || 0); 
    
    const intendedUsdtSpent = parseFloat(botState.lStateData.lastOrder?.usdt_amount || 0); 
    const actualUsdtSpent = parseFloat(orderDetails.notional || 0); 

    const finalExecutionPrice = executedAvgPrice > 0 ? executedAvgPrice : parseFloat(orderDetails.price || 0);
    
    if (executedQty <= 0 || finalExecutionPrice <= 0) {
        log('Error de procesamiento de compra: handleSuccessfulBuy llamado con ejecución o precio cero. Limpiando lastOrder.', 'error');
        await Autobot.findOneAndUpdate({}, { 'lStateData.lastOrder': null });
        return; 
    }

    // --- 2. CÁLCULO DEL NUEVO PRECIO PROMEDIO DE COMPRA (PPC) y AC ---

    const currentTotalQty = parseFloat(botState.lStateData.ac || 0); 
    const currentPriceMean = parseFloat(botState.lStateData.ppc || 0); 
    
    const currentTotalCost = currentTotalQty * currentPriceMean;
    const newOrderCost = executedQty * finalExecutionPrice; 
    
    const newTotalQty = currentTotalQty + executedQty;

    let newPPC = currentPriceMean; 
    
    if (newTotalQty > 0) {
        newPPC = (currentTotalCost + newOrderCost) / newTotalQty;
        if (isNaN(newPPC)) newPPC = currentPriceMean; 
    }

    // --- 3. GESTIÓN DEL CAPITAL RESTANTE (LBalance y Refund) ---

    const usdtToRefund = intendedUsdtSpent - actualUsdtSpent;
    let finalLBalance = parseFloat(botState.lbalance || 0);

    if (usdtToRefund > 0.01) { 
        finalLBalance = finalLBalance + usdtToRefund;
        log(`Devolviendo ${usdtToRefund.toFixed(2)} USDT al LBalance debido a ejecución parcial. Nuevo balance: ${finalLBalance.toFixed(2)} USDT.`, 'info');
    }
    
    // --- 4. ACTUALIZACIÓN ATÓMICA DE ESTADO EN LA BASE DE DATOS (CRÍTICO) ---

    const atomicUpdate = {
        $set: {
            'lbalance': finalLBalance,
            'lstate': 'BUYING', 
            'lStateData.ac': newTotalQty,
            'lStateData.ppc': newPPC,
            'lStateData.lastExecutionPrice': finalExecutionPrice,
            'lStateData.lastOrder': null, 
            'lnorder': (botState.lnorder || 0) + 1,
        },
        $inc: {
            'lStateData.orderCountInCycle': 1, 
        }
    };
    
    log(`[AUDITORÍA 1/3] -> ANTES de la actualización atómica. PPC: ${newPPC.toFixed(2)}, AC: ${newTotalQty.toFixed(8)}`, 'debug');

    const updatedBot = await Autobot.findOneAndUpdate({}, atomicUpdate, { new: true }); 

    if (updatedBot) {
        log(`[AUDITORÍA 2/3] -> DESPUÉS de actualizar. LBalance final: ${updatedBot.lbalance.toFixed(2)} USDT.`, 'debug');
        log(`[AUDITORÍA 3/3] -> VERIFICACIÓN EN DB. PPC leído: ${updatedBot.lStateData.ppc.toFixed(2)}, AC leído: ${updatedBot.lStateData.ac.toFixed(8)}, LState: ${updatedBot.lstate}`, 'debug');
    } else {
        log('[AUDITORÍA 2/3 y 3/3] -> ERROR: No se encontró el documento de Autobot después de la actualización.', 'error');
        return;
    }

    log(`[LONG] Orden confirmada. Nuevo PPC: ${newPPC.toFixed(2)}, Qty Total (AC): ${newTotalQty.toFixed(8)}. Precio de ejecución: ${finalExecutionPrice.toFixed(2)}. Transicionando a BUYING.`, 'success');
}

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
    resetAndInitializeBot,
    // ✅ ÚNICA EXPORTACIÓN DE FUNCIÓN HELPER NECESARIA EN ESTE ARCHIVO
    calculateLongTargets 
};