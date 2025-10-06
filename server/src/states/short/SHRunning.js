// BSB/server/src/states/short/SHRunning.js

const { placeFirstSellOrder, MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/orderManager');
const SSTATE = 'short';

async function run(dependencies) {
    const { botState, availableUSDT, config, log, updateBotState, updateGeneralBotState } = dependencies;

    log("Estado Short: RUNNING. Evaluando inicio de ciclo...", 'info');

    const purchaseAmount = parseFloat(config.short.purchaseUsdt);
    const currentSBalance = parseFloat(botState.sbalance || 0);

    // CRÍTICO: Verificar que el capital ASIGNADO (SBalance) y REAL sea suficiente para la primera orden.
    const isSufficient = currentSBalance >= purchaseAmount && 
                         availableUSDT >= purchaseAmount && 
                         purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (isSufficient) {
        log(`Condiciones de inicio cumplidas. SBalance disponible: ${currentSBalance.toFixed(2)} USDT.`, 'success');
        
        // 💡 CRÍTICO: Transicionar a SHBUYING inmediatamente (antes de la orden)
        // La primera orden es una VENTA en corto.
        await updateBotState('SHBUYING', SSTATE);
        
        // Colocar la primera orden de VENTA en corto
        // placeFirstSellOrder manejará la reducción del SBalance y el DCA inicial en dataManager.js
        await placeFirstSellOrder(config, dependencies.creds, log, updateBotState, updateGeneralBotState);

    } else {
        let reason = '';
        if (currentSBalance < purchaseAmount) {
            reason = `Fondo ASIGNADO (SBalance: ${currentSBalance.toFixed(2)} USDT) insuficiente.`;
        } else if (availableUSDT < purchaseAmount) {
            reason = `Fondos REALES (${availableUSDT.toFixed(2)} USDT) insuficientes.`;
        } else {
            reason = `Monto inicial (${purchaseAmount.toFixed(2)} USDT) menor que el mínimo de BitMart.`;
        }
        
        log(`No se puede iniciar el ciclo Short. Razón: ${reason} Permaneciendo en RUNNING.`, 'warning');
    }
}

module.exports = { run };