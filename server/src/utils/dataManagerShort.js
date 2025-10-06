// BSB/server/src/utils/dataManagerShort.js (CORREGIDO - Uso de profit_percent y sin dependencia circular)

const Autobot = require('../../models/Autobot');
// ❌ Importación de orderManagerShort eliminada para romper la dependencia circular.

/**
 * Recalcula el Precio Promedio de Venta (PPS), la Cantidad Acumulada (AC) y el Precio Objetivo (STP).
 * Se ejecuta después de CADA orden de VENTA exitosa (inicial o cobertura).
 * @param {object} botState - Estado actual del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {function} updateGeneralBotState - Función para actualizar SBalance, SPrice, SOrder (opcional).
 */
async function handleSuccessfulSellShort(botState, orderDetails, updateGeneralBotState = null) {
    const { sStateData, config, sbalance: currentSBalance } = botState;
    const { ac: currentAc, ppc: currentPPS, orderCountInCycle } = sStateData;
    const SYMBOL = config.symbol || 'BTC_USDT';

    // Datos de la orden llenada
    const filledSize = parseFloat(orderDetails.filledSize || orderDetails.size);
    const filledPrice = parseFloat(orderDetails.priceAvg || orderDetails.price);

    // 1. CÁLCULO DE NUEVO AC y PPS (Precio Promedio de Venta Short)
    const newAc = currentAc + filledSize;
    const newPPS = (newAc > 0) ? ((currentAc * currentPPS) + (filledSize * filledPrice)) / newAc : filledPrice;

    // 2. CÁLCULO DEL NUEVO PRECIO OBJETIVO (STP)
    // 💡 USANDO config.short.profit_percent
    const profitPercent = parseFloat(config.short.profit_percent);
    // Para SHORT, el precio objetivo debe ser MENOR al PPS (para ganar).
    const newStPrice = newPPS * (1 - (profitPercent / 100)); // PPS - profit_percent(%)

    // 3. ACTUALIZACIÓN DE CONTADORES
    const newOrderCount = orderCountInCycle + 1;

    // 4. ACTUALIZACIÓN DEL ESTADO ESPECÍFICO (sStateData)
    const updatedSStateData = {
        ac: newAc,
        ppc: newPPS, // Usamos ppc para el precio promedio de VENTA (PPS)
        pm: newStPrice, // Inicializamos PM (Precio Mínimo) con el STP
        pc: newStPrice, // Inicializamos PC (Precio de Cierre) con el STP
        orderCountInCycle: newOrderCount,
        lastOrder: null // Limpiamos la última orden al llenarse
    };
    
    // Limpiamos el monto requerido de cobertura
    if (sStateData.requiredCoverageAmount > 0) {
        updatedSStateData.requiredCoverageAmount = 0;
    }
    
    await Autobot.findOneAndUpdate({}, { 'sStateData': updatedSStateData });

    // 5. ACTUALIZACIÓN DEL ESTADO GENERAL
    const updateGeneral = {
        stprice: newStPrice, // Guardamos el nuevo precio objetivo
        snorder: newOrderCount, // Número de órdenes
        scoverage: 0 // Resetear la cobertura requerida
    };

    if (updateGeneralBotState) {
        await updateGeneralBotState(updateGeneral);
    }
    
    // 6. TRANSICIÓN DE ESTADO FINAL
    const newState = newOrderCount > 0 ? 'BUYING' : 'RUNNING'; 
    await Autobot.findOneAndUpdate({}, { 'sstate': newState });

    console.log(`[SHORT] Venta/Cobertura exitosa. PPS: ${newPPS.toFixed(2)}, AC: ${newAc.toFixed(8)}. Nuevo estado: ${newState}`);
}


/**
 * Lógica para manejar una orden de COMPRA exitosa (cierre de ciclo Short).
 * @param {object} botStateObj - Estado del bot antes de la compra.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {object} dependencies - Dependencias necesarias.
 */
async function handleSuccessfulBuyToCoverShort(botStateObj, orderDetails, dependencies) {
    // ✅ Importación Tardia: Se carga el módulo SOLO cuando se ejecuta esta función.
    const { handleSuccessfulBuyToCoverShort: SBuyingHandler } = require('../states/short/SBuying');
    
    await SBuyingHandler(botStateObj, orderDetails, dependencies);
}


module.exports = {
    handleSuccessfulSellShort,
    handleSuccessfulBuyToCoverShort
};