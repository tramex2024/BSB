const Autobot = require('../../models/Autobot');
// NOTA: Se eliminó 'const log = console.log' para asegurar que se use el 'log' inyectado
// que emite al frontend (Socket.IO).

/**
 * Recalcula el Precio Promedio de Compra (PPC), la Cantidad Acumulada (AC) y el Precio Objetivo (LTP).
 * Se ejecuta después de CADA orden de COMPRA exitosa (inicial o cobertura).
 * * NOTA CRÍTICA: Se asume que el LBalance ya fue descontado en orderManager/coverageLogic antes de la orden.
 * * @param {object} botState - Estado actual del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {function} updateGeneralBotState - Función para actualizar el estado general (opcional).
 * @param {function} log - 🛑 CRÍTICO: Función de logging inyectada.
 */
async function handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState = null, log) { // 🛑 'log' AÑADIDO
    const { lStateData, config } = botState;
    // Usamos una pequeña tolerancia para el chequeo de AC, ya que puede ser casi cero en la primera orden.
    const AC_TOLERANCE = 0.00000001; 
    const { ac: currentAc, ppc: currentPPC, orderCountInCycle } = lStateData;

    // Datos de la orden llenada
    const filledSize = parseFloat(orderDetails.filledSize || orderDetails.size);
    const filledPrice = parseFloat(orderDetails.priceAvg || orderDetails.price);
    // CRÍTICO: Usar el 'amount' si está disponible o calcular el USDT gastado
    const filledUsdt = parseFloat(orderDetails.amount || (filledSize * filledPrice)); 

    // 1. CÁLCULO DE NUEVO AC y PPC (Average Cost / Precio Promedio)
    const newAc = currentAc + filledSize;
    // Nueva fórmula para el promedio ponderado: (Costo Total Anterior + Costo Orden Actual) / Nuevo AC
    const newPPC = (newAc > 0) ? ((currentAc * currentPPC) + (filledUsdt)) / newAc : filledPrice;

    // 2. CÁLCULO DEL NUEVO PRECIO OBJETIVO (LTP)
    // El 'trigger' de la configuración es el 'profit_percent'
    const profitPercent = parseFloat(config.long.trigger); 
    const newLtPrice = newPPC * (1 + (profitPercent / 100)); // PPC + profit_percent(%)

    // 3. 🛑 CRÍTICO: ACTUALIZACIÓN DE CONTADORES
    let newState;
    let newOrderCount;

    if (currentAc < AC_TOLERANCE) {
        // 1. Confirmación de la orden inicial: Mantenemos el candado en 1 y transicionamos a SELLING.
        newOrderCount = 1; 
        newState = 'SELLING'; // Transición de la orden inicial
        log("[LONG] Orden inicial confirmada. Transicionando a SELLING.");
    } else {
        // 2. Confirmación de orden de cobertura: Incrementamos el contador.
        newOrderCount = orderCountInCycle + 1;
        newState = 'BUYING'; // Permanece en BUYING para esperar la próxima acción (DCA o Venta)
        log(`[LONG] Orden de cobertura confirmada. Contador incrementado a ${newOrderCount}.`);
    }

    // 4. ACTUALIZACIÓN DEL ESTADO ESPECÍFICO (lStateData)
    const updatedLStateData = {
        ac: newAc,
        ppc: newPPC,
        pm: newLtPrice, // Inicializamos PM con el LTP (Precio de Monitoreo/Venta)
        pc: newLtPrice, // Inicializamos PC con el LTP (Precio de Cierre/Venta)
        orderCountInCycle: newOrderCount, // Usamos el nuevo conteo
        lastOrder: null // Limpiamos la última orden al llenarse
    };
    await Autobot.findOneAndUpdate({}, { 'lStateData': updatedLStateData });

    // 5. ACTUALIZACIÓN DEL ESTADO GENERAL
    const updateGeneral = {
        ltprice: newLtPrice, // Guardamos el nuevo precio objetivo
        lnorder: newOrderCount, // Número de órdenes
        lcoverage: 0, // Resetear la cobertura requerida (se asume que se completó)
    };
    
    if (updateGeneralBotState) {
        await updateGeneralBotState(updateGeneral);
    }
    
    // 6. TRANSICIÓN DE ESTADO FINAL
    await Autobot.findOneAndUpdate({}, { 'lstate': newState });

    log(`[LONG] Compra exitosa. PPC: ${newPPC.toFixed(2)}, AC: ${newAc.toFixed(8)}. Nuevo estado: ${newState}`);
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