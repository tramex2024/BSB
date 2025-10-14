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
    
    // Usamos parseFloat y aseguramos que el valor sea 0 si es null/undefined/NaN.
    const executedQty = parseFloat(orderDetails.filledSize || 0); // La cantidad de BTC comprada (tc_size)
    const executedAvgPrice = parseFloat(orderDetails.priceAvg || 0); // Precio promedio de ejecución real
    const usdtAmount = parseFloat(orderDetails.notional || botState.lStateData.lastOrder?.usdt_amount || 0); // Monto USDT gastado

    // Determinar el precio final a usar. priceAvg tiene prioridad.
    const finalPriceUsed = executedAvgPrice > 0 ? executedAvgPrice : parseFloat(orderDetails.price || 0);
    
    // Si no se ejecutó nada, o el precio es ilógico, registramos y salimos.
    if (executedQty <= 0 || finalPriceUsed <= 0) {
        log('Error de procesamiento de compra: handleSuccessfulBuy llamado con ejecución o precio cero. Limpiando lastOrder.', 'error');
        // Limpiamos el lastOrder y dejamos el estado en BUYING/RUNNING si no hay posición.
        await Autobot.findOneAndUpdate({}, { 'lStateData.lastOrder': null });
        return; 
    }

    // --- 2. CÁLCULO DEL NUEVO PRECIO MEDIO (PM) ---

    // Extraer datos de la posición actual con seguridad (si es la primera orden, serán 0)
    const currentTotalQty = parseFloat(botState.lStateData.tc || 0); // Total Count actual (ej: BTC)
    const currentPriceMean = parseFloat(botState.lStateData.pm || 0); // Precio Medio actual
    
    // Costo total actual de la posición y costo de la nueva orden
    const currentTotalCost = currentTotalQty * currentPriceMean;
    const newOrderCost = executedQty * finalPriceUsed;
    
    // Nuevo tamaño total de la posición (denominador)
    const newTotalQty = currentTotalQty + executedQty;

    // Calculamos el nuevo precio medio. Usamos el precio anterior como fallback.
    let newPriceMean = currentPriceMean; 
    
    if (newTotalQty > 0) {
        // ✅ CORRECCIÓN: Evitamos la división por cero/NaN
        newPriceMean = (currentTotalCost + newOrderCost) / newTotalQty;
        // ⚠️ También aseguramos que el resultado no sea NaN (aunque ya lo verificamos)
        if (isNaN(newPriceMean)) newPriceMean = currentPriceMean; 
    }

    // --- 3. GESTIÓN DEL CAPITAL RESTANTE (LBalance) ---

    // Si la orden fue parcial (executedQty < size o usdtAmount parcial), 
    // debemos calcular el USDT restante y devolverlo al LBalance.
    // Asumimos que la API de BitMart solo descuenta lo ejecutado. Si no, necesitaríamos más datos.
    // Por ahora, solo actualizamos el LBalance si la orden no se llenó completamente (lógica avanzada).
    
    // --- 4. ACTUALIZAR ESTADO DE LA BASE DE DATOS ---

    // Preparar los nuevos datos de lStateData
    const updatedLStateData = {
        ...botState.lStateData,
        tc: newTotalQty,
        pm: newPriceMean, // ¡CORREGIDO!
        orderCountInCycle: botState.lStateData.orderCountInCycle + 1, // Aumentar el contador de órdenes
        lastOrder: null, // Limpiar la última orden (se completó)
    };

    // Determinar el estado de transición:
    const nextState = botState.lStateData.orderCountInCycle === 0 ? 'SELLING' : 'BUYING';

    // 🛑 TRANSACCIÓN ATÓMICA: Actualizar la posición y cambiar el estado en una sola operación.
    await Autobot.findOneAndUpdate({}, { 
        'lStateData': updatedLStateData,
        'lstate': nextState // SELLING (si es la primera compra) o BUYING (si es cobertura)
    });

    log(`[LONG] Orden confirmada. Nuevo PM: ${newPriceMean.toFixed(2)}, Qty: ${newTotalQty.toFixed(8)}. Transicionando a ${nextState}.`, 'info');

    // Notificación:
    // Solo notificamos si la transición es a SELLING, si no, se mantiene en BUYING.
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