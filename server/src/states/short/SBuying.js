// BSB/server/src/states/short/SBuying.js

const { placeBuyOrder } = require('../../utils/orderManager');

const TRAILING_STOP_PERCENTAGE = 0.4;
const SSTATE = 'short'; // Constante para la estrategia actual

// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL (BTC)
// =========================================================================

/**
 * Lógica para manejar una orden de compra exitosa (cierre de ciclo Short).
 * Ocurre cuando se recompra BTC para liquidar la posición SHORT abierta.
 * @param {object} botStateObj - Estado del bot antes de la compra.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {object} dependencies - Dependencias inyectadas.
 */
async function handleSuccessfulBuy(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateLStateData, updateGeneralBotState } = dependencies;
    const { av: totalBtcBought, ppv } = botStateObj.sStateData; // BTC total que se recompró y el Precio Promedio de Venta
    
    // El monto real de BTC recomprado que se devuelve al capital operativo (SBalance)
    const btcRecovered = totalBtcBought; // Asumimos que la recompra es por el total 'av'
    
    // 1. CÁLCULO DE GANANCIA (o Pérdida)
    // Ganancia en USDT: (Precio Promedio de Venta * BTC vendido) - (Precio Promedio de Compra * BTC recomprado)
    const totalUsdtGained = totalBtcBought * ppv; // USDT generado en la venta inicial
    const totalUsdtSpent = totalBtcBought * parseFloat(orderDetails.price); // USDT gastado en la recompra
    const profit = totalUsdtGained - totalUsdtSpent; 

    // 2. RECUPERACIÓN DE CAPITAL OPERATIVO (SBalance)
    // El SBalance suma la cantidad de BTC recuperada (capital operativo).
    const newSBalance = botStateObj.sbalance + btcRecovered; 
    
    await updateGeneralBotState({ 
        sbalance: newSBalance,
        totalProfit: (botStateObj.totalProfit || 0) + profit // Sumamos la ganancia (o restamos pérdida)
    });

    log(`Cierre de Ciclo Short Exitoso! Ganancia: ${profit.toFixed(2)} USDT.`, 'success');
    log(`SBalance actualizado. Capital operativo disponible: ${newSBalance.toFixed(8)} BTC.`, 'info');

    // 3. RESETEO DE DATOS DE CICLO
    const resetData = { 
        av: 0, ppv: 0, 
        orderCountInCycle: 0, lastOrder: null, 
        pv: 0, pc: 0, LTPrice: 0 
    };
    await updateLStateData(resetData); // Asumo que el modelo usa updateLStateData o updateSStateData para los datos del ciclo
    
    // 4. TRANSICIÓN DE ESTADO
    if (config.short.stopAtCycle) {
        log('stopAtCycle activado. Bot Short se detendrá.', 'info');
        await updateBotState('STOPPED', SSTATE);
    } else {
        await updateBotState('RUNNING', SSTATE); // Volver a RUNNING para esperar nueva señal
    }
}


// =========================================================================
// FUNCIÓN PRINCIPAL DE GESTIÓN DEL ESTADO BUYING
// =========================================================================

async function run(dependencies) {
    // Extraemos todas las dependencias
    const { botState, currentPrice, config, creds, log, updateLStateData, updateBotState, updateGeneralBotState } = dependencies;
    
    // Inyectamos las dependencias para el handler
    const handlerDependencies = { config, log, updateBotState, updateLStateData, updateGeneralBotState, botState };

    const { av: avBuying, pv, pc } = botState.sStateData; // av = BTC total vendido (a recomprar)

    log("Estado Short: BUYING. Gestionando recompras...", 'info');

    // 1. CÁLCULO DEL TRAILING STOP (Invertido)
    const newPv = Math.min(pv || currentPrice, currentPrice); // PV = Precio Mínimo alcanzado
    const newPc = newPv * (1 + (TRAILING_STOP_PERCENTAGE / 100)); // PC = Precio de Recompra (por encima del mínimo)

    // 2. ACTUALIZACIÓN Y PERSISTENCIA DE DATOS
    botState.sStateData.pv = newPv;
    botState.sStateData.pc = newPc;
    await updateLStateData(botState.sStateData); // Asumimos que usa updateLStateData para guardar

    // 3. CONDICIÓN DE RECOMPRA Y LIQUIDACIÓN
    if (avBuying > 0) {
        if (currentPrice >= newPc) {
            log(`Condiciones de recompra por Trailing Stop alcanzadas. Colocando orden de compra a mercado para liquidar ${avBuying.toFixed(8)} BTC.`, 'success');
            
            // LLAMADA ACTUALIZADA: placeBuyOrder debe ser modificado para aceptar un callback
            await placeBuyOrder(config, creds, avBuying, log, handleSuccessfulBuy, botState, handlerDependencies); 

            // Nota: El estado PERMANECE en BUYING hasta que la orden se confirme como FILLED.
        }
    }
    
    log(`Esperando condiciones para la recompra. Precio actual: ${currentPrice.toFixed(2)}, PV: ${newPv.toFixed(2)}, PC: ${newPc.toFixed(2)}`, 'info');
}

module.exports = { 
    run, 
    handleSuccessfulBuy // Exportamos para que orderManager pueda usarlo.
};