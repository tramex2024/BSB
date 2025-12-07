// BSB/server/src/managers/longDataManager.js (CORREGIDO)

const Autobot = require('../../models/Autobot');
// Importar solo el handler del estado LSelling
const { handleSuccessfulSell: LSellingHandler } = require('../states/long/LSelling');
const { saveExecutedOrder } = require('../../services/orderPersistenceService'); // 💡 NUEVA IMPORTACIÓN

/**
 * Maneja una compra exitosa (total o parcial), actualiza la posición del bot Long
 * (PPC, AC, AI, LBalance, lastExecutionPrice), y pasa al estado de gestión de posición (BUYING).
 */
async function handleSuccessfulBuy(botState, orderDetails, log) {
    // --- 1. EXTRACCIÓN Y VALIDACIÓN DE DATOS DE LA ORDEN ---
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);    
    const executedAvgPrice = parseFloat(orderDetails.priceAvg || 0);    
    const finalExecutionPrice = executedAvgPrice > 0 ? executedAvgPrice : parseFloat(orderDetails.price || 0);

    // Monto que el bot INTENTÓ bloquear (usado para calcular el reembolso si la orden es parcial)
    const intendedUsdtCostBlocked = parseFloat(botState.lStateData.lastOrder?.usdt_cost_real || 0); 

    // 🛑 [FIX CRÍTICO 1: Cálculo de Costo Real (AI)]
    // Corregido para sumar el costo real ejecutado (Notional + Fee pagado en USDT).
    const executedNotional = parseFloat(orderDetails.notional || 0);
    const executedFee = parseFloat(orderDetails.fee || 0); // Asumiendo que el fee es en USDT
    const actualExecutedCost = executedNotional + executedFee;
    
    if (executedQty <= 0 || finalExecutionPrice <= 0 || actualExecutedCost <= 0) {
        log('Error de procesamiento de compra: handleSuccessfulBuy llamado con ejecución, precio o costo cero. Limpiando lastOrder.', 'error');
        await Autobot.findOneAndUpdate({}, { $set: { 'lStateData.lastOrder': null } });
        return;    
    }

    // --- 2. CÁLCULO DEL NUEVO PRECIO PROMEDIO DE COMPRA (PPC) y AC ---
    
    const isFirstOrder = botState.lStateData.orderCountInCycle === 0; 
   
    // Si es la primera orden, inicializar a 0 para evitar residuos, sino usar el valor de la BD.
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(botState.lStateData.ac || 0);    
    const currentAI = isFirstOrder ? 0 : parseFloat(botState.lStateData.ai || 0); 
    
    // Nuevas cantidades
    const newTotalQty = currentTotalQty + executedQty;
    const newAI = currentAI + actualExecutedCost; // 🛑 USO DEL COSTO REAL EJECUTADO

    let newPPC = 0;    
    
    if (newTotalQty > 0) {
        // 🛑 [FIX CRÍTICO 2: Simplificación del cálculo de PPC]
        // Para cualquier orden (primera o cobertura), el PPC es la fórmula ponderada: AI / AC
        newPPC = newAI / newTotalQty;
        
        // Si hay alguna inconsistencia (lo cual no debería ocurrir aquí), mantener el valor actual como respaldo.
        if (isNaN(newPPC) || newPPC === Infinity) newPPC = currentAI;    
    }

    // --- 3. GESTIÓN DEL CAPITAL RESTANTE (LBalance y Refund) ---

    // El monto a reembolsar es el bloqueo inicial menos el costo real ejecutado
    const refundAmount = intendedUsdtCostBlocked - actualExecutedCost;    
    let finalLBalance = parseFloat(botState.lbalance || 0);

    if (refundAmount > 0.01) {    
        finalLBalance = finalLBalance + refundAmount;
        log(`Devolviendo ${refundAmount.toFixed(2)} USDT al LBalance debido a ejecución parcial/fees bloqueados no usados. Nuevo balance: ${finalLBalance.toFixed(2)} USDT.`, 'info');
    }

    // ------------------------------------------------------------------------
    // 💡 MODIFICACIÓN 1: PERSISTENCIA HISTÓRICA DE LA ORDEN
    // ------------------------------------------------------------------------
    // ... (La lógica de persistencia se mantiene igual, no es la causa del problema)
    const SYMBOL = botState.config.symbol || 'BTC_USDT'; // Asumiendo que el símbolo está en config
    
    const orderToSave = {    
        ...orderDetails,
        orderTime: new Date(orderDetails.createTime || Date.now()),
        symbol: SYMBOL, 
        type: orderDetails.type || 'MARKET' 
    };
    const savedOrder = await saveExecutedOrder(orderToSave, 'long');    
    if (savedOrder) {
        log(`Orden Long ID ${orderDetails.orderId} guardada en el historial de Órdenes.`, 'debug');
    }
    
    // ------------------------------------------------------------------------
    // 💡 CÁLCULO DE TARGETS DE COBERTURA Y VENTA
    // ------------------------------------------------------------------------
    const { price_var, size_var, purchaseUsdt, profit_percent } = botState.config.long;
    
    // 2.1. Calcular el siguiente Precio de Cobertura (Decremento por price_var)
    const coveragePercentage = price_var / 100;
    const newNextCoveragePrice = finalExecutionPrice * (1 - coveragePercentage);
    
    // 2.2. Calcular el siguiente Monto Requerido (Escalamiento por size_var)
    const lastOrderUsdtAmount = parseFloat(botState.lStateData.lastOrder?.usdt_amount || purchaseUsdt);
    const sizeVariation = size_var / 100;
    const newRequiredCoverageAmount = lastOrderUsdtAmount * (1 + sizeVariation);
    
    // 2.3. ✅ Calcular el Precio de Venta (LTPrice)
    const profitPercentage = profit_percent / 100;
    const newLTPrice = newPPC * (1 + profitPercentage); // Usamos el PPC recién calculado.

    log(`Targets calculados. Sell Price: ${newLTPrice.toFixed(2)}, Next Price: ${newNextCoveragePrice.toFixed(2)}, Next Amount: ${newRequiredCoverageAmount.toFixed(2)} USDT.`, 'info');

    // --- 4. ACTUALIZACIÓN ATÓMICA DE ESTADO EN LA BASE DE DATOS (CRÍTICO) ---

    const atomicUpdate = {
    $set: {
        'lbalance': finalLBalance,
        // Actualizar el precio de toma de ganancias (ltprice)
        'ltprice': newLTPrice,    
        
        // Actualización de LStateData con los nuevos valores promediados:
        'lStateData.ac': newTotalQty,
        'lStateData.ai': newAI,    
        'lStateData.ppc': newPPC,

        // Persistir el precio base y los nuevos targets
        'lStateData.lastExecutionPrice': finalExecutionPrice,
        'lStateData.nextCoveragePrice': newNextCoveragePrice,    
        'lStateData.requiredCoverageAmount': newRequiredCoverageAmount,
        
        // CAMBIO CLAVE: INICIO DEL CICLO
        // Si orderCountInCycle era 0, establecer cycleStartTime
        ...(isFirstOrder && {    
            'lStateData.cycleStartTime': new Date()    
        }),        

        'lStateData.lastOrder': null,    
        // Si lnorder es un campo de lStateData (ajusta la clave si es necesario)
        'lStateData.lNOrderMax': (botState.lStateData.lNOrderMax || 0) + 1,
    },
    $inc: {
        'lStateData.orderCountInCycle': 1, 
        // Incrementamos el contador de ciclo global (lcycle) si es la primera orden
        ...(isFirstOrder && { 'lcycle': 1 }),    
    }
};
    
    log(`[AUDITORÍA LDM 1/3] -> ANTES de la actualización atómica. PPC: ${newPPC.toFixed(2)}, AC: ${newTotalQty.toFixed(8)}, AI: ${newAI.toFixed(2)}`, 'debug');

    const updatedBot = await Autobot.findOneAndUpdate({}, atomicUpdate, { new: true });    

    if (updatedBot) {
        log(`[AUDITORÍA LDM 2/3] -> DESPUÉS de actualizar. LBalance final: ${updatedBot.lbalance.toFixed(2)} USDT.`, 'debug');
        log(`[AUDITORÍA LDM 3/3] -> VERIFICACIÓN EN DB. PPC leído: ${updatedBot.lStateData.ppc.toFixed(2)}, AC leído: ${updatedBot.lStateData.ac.toFixed(8)}, LState: ${updatedBot.lstate}, LCycle: ${updatedBot.lcycle}`, 'debug');
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
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies, log) {
    // LSellingHandler ya está importado en la parte superior.
    await LSellingHandler(botStateObj, orderDetails, dependencies);
}

module.exports = {
    handleSuccessfulBuy,
    handleSuccessfulSell
};