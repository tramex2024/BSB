// BSB/server/src/states/short/SHRunning.js

const { placeFirstSellOrder, MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/orderManagerShort'); // Asumo que el nombre es orderManagerShort.js
const SSTATE = 'short';

async function run(dependencies) {
    // 💡 CRÍTICO: Asegurarse de recibir currentPrice
    const { botState, availableUSDT, config, log, updateBotState, updateGeneralBotState, currentPrice } = dependencies;

    log("Estado Short: RUNNING. Evaluando inicio de ciclo...", 'info');

    // 1. OBTENER MONTOS Y CALCULAR VALOR NOCIONAL EN USDT
    const sellBtcAmount = parseFloat(config.short.sellBtc || 0);
    const price = parseFloat(currentPrice || 0); // Aseguramos que el precio sea un número

    // 2. Calcular el valor nocional de la orden en USDT (para chequeos)
    const purchaseAmountUSDT = sellBtcAmount * price; 
    
    const currentSBalance = parseFloat(botState.sbalance || 0);

    // 3. CHEQUEO DE SUFICIENCIA (Usando el valor nocional en USDT)
    const isSufficient = currentSBalance >= purchaseAmountUSDT && 
                         availableUSDT >= purchaseAmountUSDT && 
                         purchaseAmountUSDT >= MIN_USDT_VALUE_FOR_BITMART;

    if (isSufficient) {
        log(`Condiciones de inicio cumplidas. SBalance disponible: ${currentSBalance.toFixed(2)} USDT.`, 'success');
        
        // Transicionar a SHBUYING inmediatamente (después de la primera VENTA en corto, se espera una COMPRA)
        // Nota: La transición a SHBUYING aquí está bien si tu convención es esperar la orden de cubrimiento.
        await updateBotState('SHBUYING', SSTATE);
        
        // Colocar la primera orden de VENTA en corto
        await placeFirstSellOrder(config, dependencies.creds, log, updateBotState, updateGeneralBotState, currentPrice);

    } else {
        let reason = '';
        
        if (price === 0) {
            reason = `No se pudo obtener el precio actual del mercado para calcular el valor de la orden.`;
        } else if (currentSBalance < purchaseAmountUSDT) {
            reason = `Fondo ASIGNADO (SBalance: ${currentSBalance.toFixed(2)} USDT) insuficiente para orden de ${purchaseAmountUSDT.toFixed(2)} USDT.`;
        } else if (availableUSDT < purchaseAmountUSDT) {
            reason = `Fondos REALES (${availableUSDT.toFixed(2)} USDT) insuficientes.`;
        } else {
            // Aquí cae si purchaseAmountUSDT es válido pero menor al mínimo (ej. < 5.00)
            reason = `Monto inicial (${purchaseAmountUSDT.toFixed(2)} USDT) menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART}).`;
        }
        
        log(`No se puede iniciar el ciclo Short. Razón: ${reason} Permaneciendo en RUNNING.`, 'warning');
    }
}

module.exports = { run };