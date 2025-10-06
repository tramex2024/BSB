// BSB/server/src/utils/dataManagerShort.js (CORREGIDO - Uso de config.short.profit_percent para el Precio Objetivo)

const Autobot = require('../../models/Autobot');
const { placeBuyToCoverOrder } = require('./orderManagerShort'); 

/**
 * Recalcula el Precio Promedio de Venta (PPS), la Cantidad Acumulada (AC) y el Precio Objetivo (STP).
 * Se ejecuta después de CADA orden de VENTA exitosa (inicial o cobertura).
 * @param {object} botState - Estado actual del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {function} updateGeneralBotState - Función para actualizar SBalance, SPrice, SOrder (opcional, solo para la primera orden).
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
    // 💡 USANDO config.short.profit_percent de tu esquema
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
    
    // Limpiamos el monto requerido de cobertura, ya que la orden se llenó.
    if (sStateData.requiredCoverageAmount > 0) {
        updatedSStateData.requiredCoverageAmount = 0;
    }
    
    await Autobot.findOneAndUpdate({}, { 'sStateData': updatedSStateData });

    // 5. ACTUALIZACIÓN DEL ESTADO GENERAL (SBalance y StPrice)
    const updateGeneral = {
        stprice: newStPrice, // Guardamos el nuevo precio objetivo
        snorder: newOrderCount, // Número de órdenes
        scoverage: 0 // Resetear la cobertura requerida
    };

    if (updateGeneralBotState) {
        await updateGeneralBotState(updateGeneral);
    }
    
    // 6. TRANSICIÓN DE ESTADO FINAL
    // Si ya tenemos una posición, vamos al estado BUYING (Liquidación por Trailing Stop).
    const newState = newOrderCount > 0 ? 'BUYING' : 'RUNNING'; 
    await Autobot.findOneAndUpdate({}, { 'sstate': newState });

    console.log(`[SHORT] Venta/Cobertura exitosa. PPS: ${newPPS.toFixed(2)}, AC: ${newAc.toFixed(8)}. Nuevo estado: ${newState}`);
}


/**
 * Lógica para manejar una orden de COMPRA exitosa (cierre de ciclo Short).
 * Esta función es invocada desde orderManagerShort.js.
 * @param {object} botStateObj - Estado del bot antes de la compra.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {object} dependencies - Dependencias necesarias (log, updateBotState, updateSStateData, updateGeneralBotState).
 */
async function handleSuccessfulBuyToCoverShort(botStateObj, orderDetails, dependencies) {
    // Nota: Esta función es manejada por SBuying.js/handleSuccessfulBuyToCoverShort
    // Aseguramos que la lógica central de SBuying.js se ejecute.
    const { handleSuccessfulBuyToCoverShort: SBuyingHandler } = require('../states/short/SBuying');
    
    // El handler de SBuying.js ya tiene la lógica de cálculo de profit, reinicio, y transición de estado.
    await SBuyingHandler(botStateObj, orderDetails, dependencies);
}


module.exports = {
    handleSuccessfulSellShort,
    handleSuccessfulBuyToCoverShort
};