// BSB/server/src/states/short/SHRunning.js (FINALIZADO - Chequeo de Capital en USDT)

const { placeFirstSellOrder, MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/orderManagerShort');
const SSTATE = 'short';

async function run(dependencies) {
    // Aseguramos que currentPrice se recibe para el cálculo nocional
    const { botState, availableUSDT, config, log, updateBotState, updateGeneralBotState, currentPrice } = dependencies;

    log("Estado Short: RUNNING. Evaluando inicio de ciclo...", 'info');

    // ------------------------------------------------------------------
    // 1. OBTENER MONTOS Y CALCULAR VALORES NOCIONALES EN USDT
    // ------------------------------------------------------------------
    const sellBtcAmount = parseFloat(config.short.sellBtc || 0);
    const price = parseFloat(currentPrice || 0); 

    // ✅ CAPITAL ASIGNADO (SBalance) CONVERTIDO A VALOR NOCIONAL EN USDT
    const currentSBalanceBTC = parseFloat(botState.sbalance || 0); 
    const currentSBalanceUSDT = currentSBalanceBTC * price; 

    // ✅ ORDEN INICIAL CONVERTIDA A VALOR NOCIONAL EN USDT
    const purchaseAmountUSDT = sellBtcAmount * price; 
    
    // ------------------------------------------------------------------
    // 2. CHEQUEO DE SUFICIENCIA (Todos los montos están ahora en USDT)
    // ------------------------------------------------------------------
    const isSufficient = currentSBalanceUSDT >= purchaseAmountUSDT && 
                         availableUSDT >= purchaseAmountUSDT && 
                         purchaseAmountUSDT >= MIN_USDT_VALUE_FOR_BITMART;

    if (isSufficient) {
        log(`Condiciones de inicio cumplidas. Capital asignado (USDT): ${currentSBalanceUSDT.toFixed(2)}.`, 'success');
        
        await updateBotState('BUYING', SSTATE); // Transiciona para esperar la cubertura (BUY)
        
        // Colocar la primera orden de VENTA en corto
        await placeFirstSellOrder(config, dependencies.creds, log, updateBotState, updateGeneralBotState, currentPrice);

    } else {
        let reason = '';
        
        if (price === 0) {
            reason = `No se pudo obtener el precio actual del mercado (price=0).`;
        } else if (currentSBalanceUSDT < purchaseAmountUSDT) {
            // 💡 Aquí se usará el valor actual de tu log: 0.00 USDT vs 6.26 USDT
            reason = `Fondo ASIGNADO (USDT Nocional: ${currentSBalanceUSDT.toFixed(2)}) insuficiente para orden de ${purchaseAmountUSDT.toFixed(2)} USDT.`;
        } else if (availableUSDT < purchaseAmountUSDT) {
            reason = `Fondos REALES (${availableUSDT.toFixed(2)} USDT) insuficientes.`;
        } else {
            reason = `Monto inicial (${purchaseAmountUSDT.toFixed(2)} USDT) menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART}).`;
        }
        
        log(`No se puede iniciar el ciclo Short. Razón: ${reason} Permaneciendo en RUNNING.`, 'warning');
    }
}

module.exports = { run };