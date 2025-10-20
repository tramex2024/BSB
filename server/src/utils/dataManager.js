// BSB/server/src/utils/dataManager.js

const Autobot = require('../../models/Autobot');

/**
 * Maneja una compra exitosa (total o parcial), actualiza la posición del bot
 * (Price Mean y Total Count), y pasa al estado de gestión de posición (BUYING).
 *
 * @param {object} botState - Estado actual del bot (leído antes de la ejecución de la orden).
 * @param {object} orderDetails - Detalles de la orden ejecutada (de getOrderDetail).
 * @param {function} updateGeneralBotState - Función para actualizar el estado general (LBalance).
 * @param {function} log - Función de logging.
 */
async function handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState, log) {
    const Autobot = require('../../models/Autobot'); 

    // --- 1. EXTRACCIÓN Y VALIDACIÓN DE DATOS DE LA ORDEN ---
    
    // Usamos parseFloat y aseguramos que el valor sea 0 si es null/undefined.
    const executedQty = parseFloat(orderDetails.filledSize || 0); // La cantidad de BTC comprada (tc_size)
    const executedAvgPrice = parseFloat(orderDetails.priceAvg || 0); // Precio promedio de ejecución real
    
    // El monto USDT que el bot intentó gastar (fue descontado del LBalance en placeFirstBuyOrder)
    const intendedUsdtSpent = parseFloat(botState.lStateData.lastOrder?.usdt_amount || 0); 
    // El monto REALMENTE gastado (del exchange)
    const actualUsdtSpent = parseFloat(orderDetails.notional || 0); 

    // Determinar el precio final a usar. priceAvg (precio promedio) tiene prioridad.
    const finalPriceUsed = executedAvgPrice > 0 ? executedAvgPrice : parseFloat(orderDetails.price || 0);
    
    // Si no se ejecutó nada, o el precio es ilógico, salimos.
    if (executedQty <= 0 || finalPriceUsed <= 0) {
        log('Error de procesamiento de compra: handleSuccessfulBuy llamado con ejecución o precio cero. Limpiando lastOrder.', 'error');
        // Limpiamos el lastOrder y dejamos el estado en BUYING/RUNNING si no hay posición.
        await Autobot.findOneAndUpdate({}, { 'lStateData.lastOrder': null });
        return; 
    }

    // --- 2. CÁLCULO DEL NUEVO PRECIO MEDIO (PM) ---

    // Extraer datos de la posición actual con seguridad (si es la primera orden, serán 0)
    const currentTotalQty = parseFloat(botState.lStateData.tc || 0); // Total Count actual
    const currentPriceMean = parseFloat(botState.lStateData.pm || 0); // Precio Medio actual
    
    // Definir el contador de órdenes para el incremento
    const currentOrderCount = parseInt(botState.lStateData.orderCountInCycle || 0); 
    
    // Costo total actual de la posición y costo de la nueva orden
    const currentTotalCost = currentTotalQty * currentPriceMean;
    const newOrderCost = executedQty * finalPriceUsed;
    
    // Nuevo tamaño total de la posición (denominador)
    const newTotalQty = currentTotalQty + executedQty;

    // Calculamos el nuevo precio medio. Usamos el precio anterior como valor de respaldo (fallback).
    let newPriceMean = currentPriceMean; 
    
    if (newTotalQty > 0) {
        // CORRECCIÓN CLAVE: Evitamos la división por cero y aseguramos el cálculo.
        newPriceMean = (currentTotalCost + newOrderCost) / newTotalQty;
        // También verificamos el resultado por si acaso, usando el precio anterior si es inválido.
        if (isNaN(newPriceMean)) newPriceMean = currentPriceMean; 
    }

    // --- 3. GESTIÓN DEL CAPITAL RESTANTE (LBalance) ---

    // ********** LÓGICA AVANZADA: DEVOLUCIÓN DE CAPITAL (CORRECCIÓN) **********
    
    // Monto a devolver al LBalance (lo que se descontó vs lo que se gastó)
    const usdtToRefund = intendedUsdtSpent - actualUsdtSpent;

    if (usdtToRefund > 0.01) { // Usamos un umbral para evitar errores de redondeo minúsculos
        const currentLBalance = parseFloat(botState.lbalance || 0);
        const newLBalance = currentLBalance + usdtToRefund;

        log(`Devolviendo ${usdtToRefund.toFixed(2)} USDT al LBalance debido a ejecución parcial. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');

        // Actualizar el LBalance en el documento principal de la DB
        await updateGeneralBotState({ lbalance: newLBalance });
    }

    // ************************************************************
    
    // --- 4. ACTUALIZAR ESTADO DE LA BASE DE DATOS ---

    // La transición es siempre a BUYING para gestionar la posición/cobertura.
    const nextState = 'BUYING'; 
    
    // Usar $set para actualizar campos individuales del sub-documento de forma segura.
    const update = {
        'lstate': nextState,
        'lStateData.tc': newTotalQty,
        'lStateData.pm': newPriceMean,
        'lStateData.orderCountInCycle': currentOrderCount + 1, // Aumentar el contador
        'lStateData.lastOrder': null, // Limpiar la última orden (se completó)
    };
    
    await Autobot.findOneAndUpdate({}, { $set: update });

    log(`[LONG] Orden confirmada. Nuevo PM: ${newPriceMean.toFixed(2)}, Qty: ${newTotalQty.toFixed(8)}. Transicionando a ${nextState}.`, 'info');

    // Notificación:
    await updateGeneralBotState({ lstate: nextState }); 
}

/**
 * Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
 * @param {object} botStateObj - Estado del bot antes de la venta.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {object} dependencies - Dependencias necesarias (DEBE incluir 'log').
 */
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


module.exports = {
    handleSuccessfulBuy,
    handleSuccessfulSell
};