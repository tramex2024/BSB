// BSB/server/src/utils/dataManagerShort.js

const { log } = require('../logger'); 
// Asumimos que existen funciones específicas para Short
const { 
    calculateShortTargets, // Para calcular el Target Price de cierre/TP
    calculateNextTarget, 
    calculateNextCoverage 
} = require('../../autobotCalculations'); 
const Autobot = require('../../models/Autobot'); 

// =========================================================================
// === [ HANDLERS SHORT ] ==================================================
// =========================================================================

/**
 * Maneja una VENTA exitosa (total o parcial), actualiza la posición del bot Short
 * (PPC, AC, lastExecutionPrice), y pasa al estado de gestión de posición (BUYING).
 * En Short, una VENTA es la que abre o aumenta la posición (DCA UP).
 *
 * @param {object} botState - Estado actual del bot.
 * @param {object} orderDetails - Detalles de la orden ejecutada (de getOrderDetail).
 * @param {function} updateGeneralBotState - Función para actualizar el estado general (SBalance).
 * @param {function} log - Función de logging.
 */
async function handleSuccessfulSellShort(botState, orderDetails, updateGeneralBotState, log) {
    // --- 1. EXTRACCIÓN Y VALIDACIÓN DE DATOS DE LA ORDEN ---
    
    // La ejecución de VENTA devuelve USDT, pero la cantidad ejecutada es en BTC (filledSize)
    const executedQty = parseFloat(orderDetails.filledSize || 0); // BTC vendidos
    const executedAvgPrice = parseFloat(orderDetails.priceAvg || 0);  // Precio promedio de venta
    
    // La cantidad de BTC que se intentó vender se guarda en lastOrder.btc_amount
    const intendedBtcSold = parseFloat(botState.sStateData.lastOrder?.btc_amount || 0); 
    // El valor real de la venta es el 'notional'
    const actualUsdtReceived = parseFloat(orderDetails.notional || 0); 
    // El precio de ejecución es crucial para el nuevo PPC
    const finalExecutionPrice = executedAvgPrice > 0 ? executedAvgPrice : parseFloat(orderDetails.price || 0);
    
    if (executedQty <= 0 || finalExecutionPrice <= 0) {
        log('[SHORT] Error de procesamiento de VENTA: handleSuccessfulSellShort llamado con ejecución o precio cero. Limpiando lastOrder.', 'error');
        await Autobot.findOneAndUpdate({}, { 'sStateData.lastOrder': null });
        return; 
    }

    // --- 2. CÁLCULO DEL NUEVO PRECIO PROMEDIO DE VENTA (PPC SHORT) y AC ---
    // PPC Short es el precio promedio al que vendimos (queremos que sea alto).

    const currentTotalQty = parseFloat(botState.sStateData.ac || 0); // AC es la cantidad total de BTC vendida
    const currentPriceMean = parseFloat(botState.sStateData.ppc || 0); // PPC es el Precio Promedio de VENTA
    
    // Costo total (en USDT si lo queremos ver como valor)
    const currentTotalValue = currentTotalQty * currentPriceMean; 
    const newOrderValue = executedQty * finalExecutionPrice; 
    
    const newTotalQty = currentTotalQty + executedQty;

    let newPPC = currentPriceMean; 
    
    if (newTotalQty > 0) {
        // Recalculamos el PPC (Precio Promedio de Venta)
        newPPC = (currentTotalValue + newOrderValue) / newTotalQty;
        if (isNaN(newPPC)) newPPC = currentPriceMean; 
    }

    // --- 3. GESTIÓN DEL CAPITAL RESTANTE (SBalance y Refund BTC) ---

    // Reembolsamos el BTC que no se vendió al SBalance
    const btcToRefund = intendedBtcSold - executedQty;
    let finalSBalance = parseFloat(botState.sbalance || 0);

    if (btcToRefund > 0.00000001) { 
        finalSBalance = finalSBalance + btcToRefund;
        log(`[SHORT] Devolviendo ${btcToRefund.toFixed(8)} BTC al SBalance debido a ejecución parcial. Nuevo balance: ${finalSBalance.toFixed(8)} BTC.`, 'info');
    }
    
    // --- 4. ACTUALIZACIÓN ATÓMICA DE ESTADO EN LA BASE DE DATOS ---

    // ✅ Creación del objeto de actualización atómica
    const atomicUpdate = {
        $set: {
            'sbalance': finalSBalance,
            'sstate': 'BUYING', // El estado final DEBE ser 'BUYING' (gestión de Short)
            'sStateData.ac': newTotalQty, // Nueva cantidad total vendida
            'sStateData.ppc': newPPC, // Nuevo Precio Promedio de Venta (PPC Short)
            'sStateData.lastExecutionPrice': finalExecutionPrice,
            'sStateData.lastOrder': null, // Limpiamos la orden confirmada
            'snorder': (botState.snorder || 0) + 1, // Incrementamos el número de orden Short total
        },
        $inc: {
            'sStateData.orderCountInCycle': 1, // Incrementamos el contador del ciclo
        }
    };
    
    log(`[SHORT AUDITORÍA 1/3] -> ANTES de la actualización atómica. PPC: ${newPPC.toFixed(2)}, AC: ${newTotalQty.toFixed(8)}`, 'debug');

    await Autobot.findOneAndUpdate({}, atomicUpdate, { new: true }); 

    log(`[SHORT] VENTA confirmada. Nuevo PPC: ${newPPC.toFixed(2)}, Qty Total (AC): ${newTotalQty.toFixed(8)}. Precio de ejecución: ${finalExecutionPrice.toFixed(2)}. Transicionando a BUYING.`, 'success');
}


/**
 * Lógica para manejar una orden de COMPRA exitosa (cobertura Short).
 * En Short, una COMPRA de Cobertura es la que genera la pérdida flotante y DCA DOWN.
 * @param {object} botState - Estado actual del bot.
 * @param {object} orderDetails - Detalles de la orden ejecutada (de getOrderDetail).
 * @param {function} updateGeneralBotState - Función para actualizar el estado general (SBalance).
 * @param {function} log - Función de logging.
 */
async function handleSuccessfulBuyShort(botState, orderDetails, updateGeneralBotState, log) {
    // La lógica de compra de cobertura Short es más simple: solo devuelve el control a SBuying
    // y actualiza el lastExecutionPrice, pero NO toca el PPC/AC/orderCountInCycle.
    
    const executedQty = parseFloat(orderDetails.filledSize || 0);     
    const executedAvgPrice = parseFloat(orderDetails.priceAvg || 0); 

    const intendedBtcBought = parseFloat(botState.sStateData.lastOrder?.btc_amount || 0); 
    const actualUsdtSpent = parseFloat(orderDetails.notional || 0); // USDT gastados
    
    const finalExecutionPrice = executedAvgPrice > 0 ? executedAvgPrice : parseFloat(orderDetails.price || 0);

    if (executedQty <= 0 || finalExecutionPrice <= 0) {
        log('[SHORT] Error de procesamiento de compra de cobertura: ejecución o precio cero. Limpiando lastOrder.', 'error');
        await Autobot.findOneAndUpdate({}, { 'sStateData.lastOrder': null });
        return; 
    }

    // --- 1. GESTIÓN DEL CAPITAL RESTANTE (SBalance y Refund BTC) ---
    // Reembolsamos el BTC que no se compró (por error de BitMart) al SBalance
    const btcToRefund = intendedBtcBought - executedQty;
    let finalSBalance = parseFloat(botState.sbalance || 0);

    if (btcToRefund > 0.00000001) { 
        finalSBalance = finalSBalance + btcToRefund;
        log(`[SHORT] Devolviendo ${btcToRefund.toFixed(8)} BTC al SBalance debido a ejecución parcial/mínimo. Nuevo balance: ${finalSBalance.toFixed(8)} BTC.`, 'info');
    }

    // --- 2. ACTUALIZACIÓN ATÓMICA DE ESTADO EN LA BASE DE DATOS ---
    // Solo actualizamos el SBalance, lastExecutionPrice y limpiamos lastOrder.
    // El sstate ya está en BUYING y orderCountInCycle NO SE INCREMENTA aquí.
    const atomicUpdate = {
        $set: {
            'sbalance': finalSBalance,
            'sStateData.lastExecutionPrice': finalExecutionPrice,
            'sStateData.lastOrder': null, // Limpiamos la orden confirmada
        },
    };

    const updatedBot = await Autobot.findOneAndUpdate({}, atomicUpdate, { new: true }); 

    if (updatedBot) {
        log(`[SHORT] Compra de Cobertura confirmada. Precio de ejecución: ${finalExecutionPrice.toFixed(2)}.`, 'success');
    } else {
        log('[SHORT] ERROR: No se encontró el documento de Autobot después de la actualización de la cobertura.', 'error');
    }
}


// Lógica para manejar una orden de compra exitosa (cierre de ciclo Short).
// Esta función se invoca desde SSelling.js
async function handleSuccessfulCloseBuyShort(botStateObj, orderDetails, dependencies) {
    const { handleSuccessfulCloseBuyShort: SSellingHandler } = require('../states/short/SSelling');
    await SSellingHandler(botStateObj, orderDetails, dependencies);
}


module.exports = {
    handleSuccessfulSellShort,
    handleSuccessfulBuyShort, // Cobertura
    handleSuccessfulCloseBuyShort, // Cierre
    // Exportar la función de cálculo Short para SBuying.js
    calculateShortTargets 
};