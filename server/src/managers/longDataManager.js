// BSB/server/src/managers/longDataManager.js (Anteriormente parte de dataManager.js)

const Autobot = require('../../models/Autobot');
// Importar solo el handler del estado LSelling
const { handleSuccessfulSell: LSellingHandler } = require('../states/long/LSelling');
const { log } = require('../../autobotLogic'); // Asumiendo que puedes obtener 'log' de botLogic

/**
 * Maneja una compra exitosa (total o parcial), actualiza la posición del bot Long
 * (PPC, AC, AI, LBalance, lastExecutionPrice), y pasa al estado de gestión de posición (BUYING).
 */
async function handleSuccessfulBuy(botState, orderDetails) { // Ya no necesita log ni updateGeneralBotState si usamos Autobot.findOne/findOneAndUpdate
    // --- 1. EXTRACCIÓN Y VALIDACIÓN DE DATOS DE LA ORDEN ---
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);      
    const executedAvgPrice = parseFloat(orderDetails.priceAvg || 0); 

    const intendedUsdtSpent = parseFloat(botState.lStateData.lastOrder?.usdt_amount || 0); 
    const actualUsdtSpent = parseFloat(orderDetails.notional || 0); 
    const realUsdtCostWithFees = parseFloat(botState.lStateData.lastOrder?.usdt_cost_real || 0); // 🛑 AI REAL USADO EN EL BLOQUEO
    
    // Si la orden se llenó parcialmente, recalculamos el costo real
    const actualRealUsdtCostWithFees = realUsdtCostWithFees * (actualUsdtSpent / intendedUsdtSpent) || actualUsdtSpent * 1.001;
    // Si la orden se llenó completamente, el reembolso es cero y el costo real es el que se bloqueó.
    
    const finalExecutionPrice = executedAvgPrice > 0 ? executedAvgPrice : parseFloat(orderDetails.price || 0);
    
    if (executedQty <= 0 || finalExecutionPrice <= 0) {
        log('Error de procesamiento de compra: handleSuccessfulBuy llamado con ejecución o precio cero. Limpiando lastOrder.', 'error');
        await Autobot.findOneAndUpdate({}, { $set: { 'lStateData.lastOrder': null } });
        return; 
    }

    // --- 2. CÁLCULO DEL NUEVO PRECIO PROMEDIO DE COMPRA (PPC) y AC ---
    // NOTA: EL PPC DEBERÍA USAR EL AI (INVERSIÓN ACUMULADA CON FEES) EN LA LÓGICA DE COBERTURA.
    
    const currentTotalQty = parseFloat(botState.lStateData.ac || 0); 
    const currentAI = parseFloat(botState.lStateData.ai || 0); // 🛑 INVERSIÓN ACUMULADA (CON FEES)
    
    const newTotalQty = currentTotalQty + executedQty;
    // 🛑 AGREGAR EL COSTO REAL DE LA ORDEN (el que incluye el fee)
    const newAI = currentAI + actualRealUsdtCostWithFees; 

    let newPPC = currentAI; 
    
    if (newTotalQty > 0) {
        // 🛑 El PPC ahora se calcula con la Inversión Acumulada (AI) que ya incluye fees
        newPPC = newAI / newTotalQty;
        if (isNaN(newPPC)) newPPC = currentAI; 
    }

    // --- 3. GESTIÓN DEL CAPITAL RESTANTE (LBalance y Refund) ---

    // El monto a reembolsar es el bloqueo inicial menos el costo real (con fees) de lo que se llenó
    const refundAmount = realUsdtCostWithFees - actualRealUsdtCostWithFees; 
    let finalLBalance = parseFloat(botState.lbalance || 0);

    if (refundAmount > 0.01) { 
        finalLBalance = finalLBalance + refundAmount;
        log(`Devolviendo ${refundAmount.toFixed(2)} USDT al LBalance debido a ejecución parcial/fees bloqueados no usados. Nuevo balance: ${finalLBalance.toFixed(2)} USDT.`, 'info');
    }
    
    // --- 4. ACTUALIZACIÓN ATÓMICA DE ESTADO EN LA BASE DE DATOS (CRÍTICO) ---

    const atomicUpdate = {
        $set: {
            'lbalance': finalLBalance,
            'lstate': 'BUYING', 
            'lStateData.ac': newTotalQty,
            'lStateData.ai': newAI, // 🛑 ACTUALIZACIÓN CLAVE: AI
            'lStateData.ppc': newPPC,
            'lStateData.lastExecutionPrice': finalExecutionPrice,
            'lStateData.lastOrder': null, 
            'lnorder': (botState.lnorder || 0) + 1,
        },
        $inc: {
            'lStateData.orderCountInCycle': 1, 
        }
    };
    
    log(`[AUDITORÍA LDM 1/3] -> ANTES de la actualización atómica. PPC: ${newPPC.toFixed(2)}, AC: ${newTotalQty.toFixed(8)}, AI: ${newAI.toFixed(2)}`, 'debug');

    const updatedBot = await Autobot.findOneAndUpdate({}, atomicUpdate, { new: true }); 

    if (updatedBot) {
        log(`[AUDITORÍA LDM 2/3] -> DESPUÉS de actualizar. LBalance final: ${updatedBot.lbalance.toFixed(2)} USDT.`, 'debug');
        log(`[AUDITORÍA LDM 3/3] -> VERIFICACIÓN EN DB. PPC leído: ${updatedBot.lStateData.ppc.toFixed(2)}, AC leído: ${updatedBot.lStateData.ac.toFixed(8)}, LState: ${updatedBot.lstate}`, 'debug');
    } else {
        log('[AUDITORÍA LDM 2/3 y 3/3] -> ERROR: No se encontró el documento de Autobot después de la actualización.', 'error');
        return;
    }

    log(`[LONG] Orden confirmada. Nuevo PPC: ${newPPC.toFixed(2)}, Qty Total (AC): ${newTotalQty.toFixed(8)}. Precio de ejecución: ${finalExecutionPrice.toFixed(2)}. Transicionando a BUYING.`, 'success');
}

/**
 * Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
 * Delega la lógica de cálculo de ganancia y reseteo a LSelling.js (el estado).
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    // LSellingHandler ya está importado en la parte superior.
    await LSellingHandler(botStateObj, orderDetails, dependencies);
}

module.exports = {
    handleSuccessfulBuy,
    handleSuccessfulSell
};