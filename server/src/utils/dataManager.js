const Autobot = require('../../models/Autobot');
// NOTA: Se eliminó 'const log = console.log' para asegurar que se use el 'log' inyectado
// que emite al frontend (Socket.IO).

/**
 * Maneja una compra exitosa (total o parcial), actualiza la posición del bot
 * (Price Mean y Total Count), y pasa al estado SELLING.
 *
 * @param {object} botState - Estado actual del bot (leído antes de la ejecución de la orden).
 * @param {object} orderDetails - Detalles de la orden ejecutada (de getOrderDetail).
 * @param {function} updateGeneralBotState - Función para actualizar el estado general (LBalance).
 * @param {function} log - Función de logging.
 */
async function handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState, log) {
    const Autobot = require('../../models/Autobot'); // Asegúrate de que esta línea esté en tu dataManager.js

    // --- 1. EXTRACCIÓN Y VALIDACIÓN DE DATOS DE LA ORDEN ---
    
    // Usamos parseFloat y aseguramos que el valor sea 0 si es null/undefined.
    const executedQty = parseFloat(orderDetails.filledSize || 0); // La cantidad de BTC comprada (tc_size)
    const executedAvgPrice = parseFloat(orderDetails.priceAvg || 0); // Precio promedio de ejecución real
    
    // El monto USDT gastado se intenta obtener de la orden original (si existe)
    const usdtAmount = parseFloat(orderDetails.notional || botState.lStateData.lastOrder?.usdt_amount || 0); 

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

    // Aquí iría la lógica avanzada para devolver capital si la orden fue parcial,
    // pero por ahora nos centramos en la estabilidad y asumimos que el LBalance ya se ajustó correctamente
    // en la lógica de 'placeFirstBuyOrder' (que solo devolvió el capital si la orden falló totalmente).
    
    // --- 4. ACTUALIZAR ESTADO DE LA BASE DE DATOS ---

    // Preparamos los nuevos datos de la posición
    const updatedLStateData = {
        ...botState.lStateData,
        tc: newTotalQty,
        pm: newPriceMean, // ¡Valor numérico estable!
        orderCountInCycle: botState.lStateData.orderCountInCycle + 1, // Aumentar el contador
        lastOrder: null, // Limpiar la última orden (se completó)
    };

    // Determinar el estado de transición: A SELLING si es la primera orden, a BUYING si es cobertura.
    const nextState = botState.lStateData.orderCountInCycle === 0 ? 'SELLING' : 'BUYING';

    // TRANSACCIÓN ATÓMICA: Actualizar la posición y cambiar el estado
    await Autobot.findOneAndUpdate({}, { 
        'lStateData': updatedLStateData,
        'lstate': nextState 
    });

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
    // ✅ Importación Tardia: Se carga el módulo SOLO cuando se ejecuta esta función.
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