// BSB/server/src/managers/longDataManager.js (CORREGIDO)

const Autobot = require('../../models/Autobot');
// Importar solo el handler del estado LSelling
const { handleSuccessfulSell: LSellingHandler } = require('../states/long/LSelling');
const { saveExecutedOrder } = require('../../services/orderPersistenceService'); // 💡 NUEVA IMPORTACIÓN

/**
 * Maneja una compra exitosa (total o parcial) y actualiza la posición (PPC, AC, AI).
 */
async function handleSuccessfulBuy(botState, orderDetails, log) {
    
    // --- 1. EXTRACCIÓN Y CÁLCULO DE COSTO REAL ---
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);  
    // Usamos priceAvg si está disponible, sino price. Este es el precio por unidad.
    const executedPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0); 
    
    // Costo base de la compra: (Cantidad Ejecutada * Precio de Ejecución)
    const baseExecutedCost = executedQty * executedPrice;

    // Asumimos que el fee (comisión) es pagado en USDT y se RESTA del capital o es un costo adicional.
    const executedFee = parseFloat(orderDetails.fee || 0); 
    
    // 🛑 ARREGLO CRÍTICO: El costo total real es el costo base + la comisión.
    // Esto es el 'notional' si estuviera presente, pero calculado robustamente.
    // Usamos el notional de la API (si es fiable) o nuestro cálculo.
    const executedNotional = parseFloat(orderDetails.notional || 0);

    // Priorizamos el notional de la API si es > 0, sino usamos el calculado.
    const actualExecutedCost = (executedNotional > 0 ? executedNotional : baseExecutedCost) + executedFee;
    
    if (executedQty <= 0 || executedPrice <= 0) {
        log('Error de procesamiento de compra: handleSuccessfulBuy llamado con ejecución, precio o costo cero. Limpiando lastOrder.', 'error');
        await Autobot.findOneAndUpdate({}, { $set: { 'lStateData.lastOrder': null } });
        return;   
    }

    // --- 2. CÁLCULO DEL NUEVO PRECIO PROMEDIO DE COMPRA (PPC) y AC ---

    const isFirstOrder = (botState.lStateData.orderCountInCycle || 0) === 0;  
    
    // Si es la primera orden, inicializar a 0 para evitar residuos
    const currentTotalQty = isFirstOrder ? 0 : parseFloat(botState.lStateData.ac || 0);    
    const currentAI = isFirstOrder ? 0 : parseFloat(botState.lStateData.ai || 0); 

    // Nuevas cantidades acumuladas
    const newTotalQty = currentTotalQty + executedQty;
    const newAI = currentAI + actualExecutedCost; // USO DEL COSTO REAL DE LA ORDEN

    let newPPC = 0;    
    
    if (newTotalQty > 0) {
        // ✅ ARREGLO PPC: PPC es siempre la Inversión Acumulada entre la Cantidad Acumulada.
        newPPC = newAI / newTotalQty;
        // Si hay una anomalía, prevenimos errores de división por cero
        if (isNaN(newPPC) || newPPC === Infinity) newPPC = currentAI;    
    }

    // --- 3. GESTIÓN DEL CAPITAL RESTANTE (LBalance y Refund) ---

    // El monto que el bot INTENTÓ bloquear (usado para calcular el reembolso si la orden es parcial)
    const intendedUsdtCostBlocked = parseFloat(botState.lStateData.lastOrder?.usdt_cost_real || 0);  

    // El monto a reembolsar es el bloqueo inicial menos el costo real ejecutado
    const refundAmount = intendedUsdtCostBlocked - actualExecutedCost;    
    let finalLBalance = parseFloat(botState.lbalance || 0);

    if (refundAmount > 0.01) {    
        finalLBalance = finalLBalance + refundAmount;
        log(`Devolviendo ${refundAmount.toFixed(2)} USDT al LBalance. Nuevo balance: ${finalLBalance.toFixed(2)} USDT.`, 'info');
    }

    // ------------------------------------------------------------------------
    // 💡 CÁLCULO DE TARGETS DE COBERTURA Y VENTA
    // ------------------------------------------------------------------------
    const { price_var, size_var, purchaseUsdt, profit_percent } = botState.config.long;
    
    const coveragePercentage = price_var / 100;
    // Usamos el precio ejecutado para calcular el siguiente nivel de cobertura
    const newNextCoveragePrice = executedPrice * (1 - coveragePercentage); 
    
    const lastOrderUsdtAmount = parseFloat(botState.lStateData.lastOrder?.usdt_amount || purchaseUsdt);
    const sizeVariation = size_var / 100;
    const newRequiredCoverageAmount = lastOrderUsdtAmount * (1 + sizeVariation);
    
    // ✅ Calcular el Precio de Venta (LTPrice) con el PPC corregido
    const profitPercentage = profit_percent / 100;
    const newLTPrice = newPPC * (1 + profitPercentage); 

    log(`Targets calculados. Sell Price: ${newLTPrice.toFixed(2)}, Next Price: ${newNextCoveragePrice.toFixed(2)}, Next Amount: ${newRequiredCoverageAmount.toFixed(2)} USDT.`, 'info');

    // --- 4. ACTUALIZACIÓN ATÓMICA DE ESTADO EN LA BASE DE DATOS (CRÍTICO) ---

    // Antes de actualizar, guardar la orden histórica
    const SYMBOL = botState.config.symbol || 'BTC_USDT';
    await saveExecutedOrder({ ...orderDetails, symbol: SYMBOL }, 'long');
    
    const atomicUpdate = {
        $set: {
            'lbalance': finalLBalance,
            'ltprice': newLTPrice,  
            
            // Actualización de LStateData con los nuevos valores promediados:
            'lStateData.ac': newTotalQty,
            'lStateData.ai': newAI,    
            'lStateData.ppc': newPPC, // Este es el valor clave corregido

            'lStateData.lastExecutionPrice': executedPrice,
            'lStateData.nextCoveragePrice': newNextCoveragePrice,    
            'lStateData.requiredCoverageAmount': newRequiredCoverageAmount,
            'lStateData.lastOrder': null,    
            'lStateData.lNOrderMax': (botState.lStateData.lNOrderMax || 0) + 1,
            
            // Iniciar el ciclo solo si era la primera orden
            ...(isFirstOrder && {    
                'lStateData.cycleStartTime': new Date()    
            }),        
        },
        $inc: {
            'lStateData.orderCountInCycle': 1,    
            // Incrementamos el contador de ciclo global (lcycle) si es la primera orden
            ...(isFirstOrder && { 'lcycle': 1 }),    
        }
    };
    
    await Autobot.findOneAndUpdate({}, atomicUpdate);    

    log(`[LONG] Transición completa. Nuevo PPC: ${newPPC.toFixed(2)}, Qty Total (AC): ${newTotalQty.toFixed(8)}.`, 'success');
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