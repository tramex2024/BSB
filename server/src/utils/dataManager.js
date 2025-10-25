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
async function handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState, log) {
    // Importamos Autobot aquí si dataManager.js no lo importa globalmente
    const Autobot = require('../../models/Autobot'); 

    // --- 1. EXTRACCIÓN Y VALIDACIÓN DE DATOS DE LA ORDEN ---
    
    const executedQty = parseFloat(orderDetails.filledSize || 0); // Cantidad de activo comprada
    const executedAvgPrice = parseFloat(orderDetails.priceAvg || 0); // Precio promedio de ejecución real
    
    const intendedUsdtSpent = parseFloat(botState.lStateData.lastOrder?.usdt_amount || 0); 
    const actualUsdtSpent = parseFloat(orderDetails.notional || 0); 

    // Obtener el precio de ejecución real.
    const finalExecutionPrice = executedAvgPrice > 0 ? executedAvgPrice : parseFloat(orderDetails.price || 0);
    
    if (executedQty <= 0 || finalExecutionPrice <= 0) {
        log('Error de procesamiento de compra: handleSuccessfulBuy llamado con ejecución o precio cero. Limpiando lastOrder.', 'error');
        await Autobot.findOneAndUpdate({}, { 'lStateData.lastOrder': null });
        return; 
    }

    // --- 2. CÁLCULO DEL NUEVO PRECIO PROMEDIO DE COMPRA (PPC) y AC ---

    const currentTotalQty = parseFloat(botState.lStateData.ac || 0); 
    const currentPriceMean = parseFloat(botState.lStateData.ppc || 0); 
    
    const currentOrderCount = parseInt(botState.lStateData.orderCountInCycle || 0); 
    
    // Costo total actual de la posición y costo de la nueva orden
    const currentTotalCost = currentTotalQty * currentPriceMean;
    const newOrderCost = executedQty * finalExecutionPrice; 
    
    // Nuevo tamaño total de la posición (AC)
    const newTotalQty = currentTotalQty + executedQty;

    // Calculamos el nuevo precio promedio de compra (PPC)
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
        // Usamos la función de utilidad para la notificación/persistencia del balance
        await updateGeneralBotState({ lbalance: newLBalance }); 
    }
    
    // --- 4. ACTUALIZAR ESTADO DE LA BASE DE DATOS (Corrección de Persistencia) ---

    const nextState = 'BUYING'; 
    
    // 🛑 CORRECCIÓN CLAVE: Modificamos el objeto 'botState' que Mongoose rastrea.
    botState.lstate = nextState;
    botState.lStateData.ac = newTotalQty;        // Guardar la Cantidad Total (AC)
    botState.lStateData.ppc = newPPC;            // Guardar el nuevo PPC
    botState.lStateData.lastExecutionPrice = finalExecutionPrice; // Precio de la ÚLTIMA orden
    
    botState.lStateData.orderCountInCycle = currentOrderCount + 1; 
    botState.lStateData.lastOrder = null;        // Limpiar la última orden
    
    // ✅ Usamos .save() en el objeto que ya se leyó, que es más fiable para subdocumentos
    await botState.save(); 

    log(`[LONG] Orden confirmada. Nuevo PPC: ${newPPC.toFixed(2)}, Qty Total (AC): ${newTotalQty.toFixed(8)}. Precio de ejecución: ${finalExecutionPrice.toFixed(2)}. Transicionando a ${nextState}.`, 'info');

    // La función de ayuda ya no es necesaria si usamos botState.save()
    // await updateGeneralBotState({ lstate: nextState }); 
}

// Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    // Importación Tardia: Se carga el módulo SOLO cuando se ejecuta esta función.
    const { handleSuccessfulSell: LSellingHandler } = require('../states/long/LSelling');
    
    // LSellingHandler se encargará de:
    // 1. Calcular ganancia/pérdida (usando dependencies.log para registrar).
    // 2. Sumar la ganancia al LBalance.
    // 3. Limpiar lStateData (PPC, AC, etc.).
    // 4. Transicionar a 'RUNNING'.
    await LSellingHandler(botStateObj, orderDetails, dependencies);
}

// Lógica de reseteo (asume que existe)
async function resetAndInitializeBot(log) {
    const Autobot = require('../../models/Autobot'); 
    
    // 1. OBTENER CONFIGURACIÓN ACTUAL (Para no perder los settings del usuario)
    const currentBot = await Autobot.findOne({});
    
    // Si no hay documento, usamos la configuración por defecto
    const config = currentBot ? currentBot.config : { /* ... tus valores por defecto ... */ }; 
    const initialLBalance = config.long.amountUsdt || 0; // Usar 15 USDT como base
    const totalProfit = currentBot ? currentBot.total_profit : 0; // Preservar ganancias
    
    // 2. ELIMINAR el documento existente
    await Autobot.deleteMany({});
    log('Documento Autobot eliminado completamente.', 'error');
    
    // 3. CREAR el objeto base limpio
    const newBotData = {
        "lstate": "RUNNING", // Estado inicial de un bot que se inicia/resetea
        "sstate": "RUNNING",
        
        "config": config,
        "total_profit": totalProfit,
        
        // 🎯 INICIALIZACIÓN CRÍTICA
        "lbalance": initialLBalance, // Usar el capital de la configuración (15 USDT)
        "sbalance": config.short.amountBtc || 0, // Si usas balance corto
        
        // Todos los contadores de ciclo y posición a CERO
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
    // La función resetAndInitializeBot también debería ser exportada si se usa externamente
    resetAndInitializeBot
};
