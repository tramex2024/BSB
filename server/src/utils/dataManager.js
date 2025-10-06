// BSB/server/src/utils/dataManager.js (CORREGIDO - Uso de config.long.profit_percent para el Precio Objetivo)

const Autobot = require('../../models/Autobot');
const { placeBuyToCoverOrder } = require('./orderManagerShort'); // Necesario para el ciclo Short (aunque este es el archivo Long)

/**
 * Recalcula el Precio Promedio de Compra (PPC), la Cantidad Acumulada (AC) y el Precio Objetivo (LTP).
 * Se ejecuta después de CADA orden de COMPRA exitosa (inicial o cobertura).
 * @param {object} botState - Estado actual del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {function} updateGeneralBotState - Función para actualizar LBalance, LtPrice, LOrder (solo para la primera orden).
 */
async function handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState = null) {
    const { lStateData, config, lbalance: currentLBalance } = botState;
    const { ac: currentAc, ppc: currentPPC, orderCountInCycle } = lStateData;
    const SYMBOL = config.symbol || 'BTC_USDT';

    // Datos de la orden llenada
    const filledSize = parseFloat(orderDetails.filledSize || orderDetails.size);
    const filledPrice = parseFloat(orderDetails.priceAvg || orderDetails.price);
    const filledUsdt = filledSize * filledPrice;

    // 1. CÁLCULO DE NUEVO AC y PPC (Average Cost / Precio Promedio)
    const newAc = currentAc + filledSize;
    // Evitar división por cero, aunque newAc siempre será > 0 aquí
    const newPPC = (newAc > 0) ? ((currentAc * currentPPC) + (filledSize * filledPrice)) / newAc : filledPrice;

    // 2. CÁLCULO DEL NUEVO PRECIO OBJETIVO (LTP)
    // 💡 USANDO config.long.profit_percent de tu esquema
    const profitPercent = parseFloat(config.long.profit_percent); 
    const newLtPrice = newPPC * (1 + (profitPercent / 100)); // PPC + profit_percent(%)

    // 3. ACTUALIZACIÓN DE CONTADORES
    const newOrderCount = orderCountInCycle + 1;

    // 4. ACTUALIZACIÓN DEL ESTADO ESPECÍFICO (lStateData)
    const updatedLStateData = {
        ac: newAc,
        ppc: newPPC,
        pm: newLtPrice, // Inicializamos PM con el LTP
        pc: newLtPrice, // Inicializamos PC con el LTP
        orderCountInCycle: newOrderCount,
        lastOrder: null // Limpiamos la última orden al llenarse
    };
    await Autobot.findOneAndUpdate({}, { 'lStateData': updatedLStateData });

    // 5. ACTUALIZACIÓN DEL ESTADO GENERAL (LBalance y LtPrice)
    const updateGeneral = {
        ltprice: newLtPrice, // Guardamos el nuevo precio objetivo
        lnorder: newOrderCount, // Número de órdenes
        lcoverage: 0 // Resetear la cobertura requerida (se recalcula en LRunning)
    };

    if (newOrderCount === 1 && updateGeneralBotState) {
        // Solo para la primera orden: descontamos el USDT del LBalance
        const newLBalance = currentLBalance - filledUsdt;
        updateGeneral.lbalance = newLBalance;
    }

    if (updateGeneralBotState) {
        await updateGeneralBotState(updateGeneral);
    }
    
    // 6. TRANSICIÓN DE ESTADO FINAL
    // Si ya tenemos una posición, vamos al estado SELLING para monitorear el Trailing Stop.
    const newState = newOrderCount > 0 ? 'SELLING' : 'RUNNING'; 
    await Autobot.findOneAndUpdate({}, { 'lstate': newState });

    console.log(`[LONG] Compra exitosa. PPC: ${newPPC.toFixed(2)}, AC: ${newAc.toFixed(8)}. Nuevo estado: ${newState}`);
}

/**
 * Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
 * Esta función se invoca desde orderManager.js.
 * @param {object} botStateObj - Estado del bot antes de la venta.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {object} dependencies - Dependencias necesarias (log, updateBotState, updateLStateData, updateGeneralBotState).
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    // Nota: Esta función es manejada por LSelling.js/handleSuccessfulSell
    // Aseguramos que la lógica central de LSelling.js se ejecute.
    const { handleSuccessfulSell: LSellingHandler } = require('../states/long/LSelling');
    
    // El handler de LSelling.js ya tiene la lógica de cálculo de profit, reinicio, y transición de estado.
    await LSellingHandler(botStateObj, orderDetails, dependencies);
}


module.exports = {
    handleSuccessfulBuy,
    handleSuccessfulSell
};