// BSB/server/src/states/short/SHNoCoverage.js (INVERTIDO)

const { MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/orderManager');
const SSTATE = 'short';

async function run(dependencies) {
    const { botState, currentPrice, availableUSDT, config, creds, log, updateBotState } = dependencies;

    log("Estado Short: SH_NO_COVERAGE. Esperando fondos o precio de cubrimiento (DOWN).", 'warning');

    const { ac: acShort, requiredCoverageAmount: requiredAmount } = botState.sStateData;
    const currentSBalance = parseFloat(botState.sbalance || 0);

    // --- 1. VERIFICACIÓN DE TRANSICIÓN A CUBRIMIENTO (Ganancia alcanzada) ---
    // En short, el precio objetivo es cuando el precio CAE.
    const targetCoverPrice = botState.sStateData.STPrice || 0; // STPrice = Precio Objetivo de Venta (Cover)

    if (currentPrice <= targetCoverPrice && acShort > 0 && targetCoverPrice > 0) {
        log(`Precio actual alcanzó el objetivo de cubrimiento (${targetCoverPrice.toFixed(2)}) desde SH_NO_COVERAGE.`, 'success');
        
        // Transicionar a SHSELLING para que se ejecute la orden de COMPRA para cubrir.
        await updateBotState('SHSELLING', SSTATE); 
        return;
    }

    // --- 2. VERIFICACIÓN DE TRANSICIÓN A VENTA/COBERTURA (Fondos recuperados) ---
    
    // Transicionar solo si el balance cubre el monto requerido y el mínimo de BitMart
    const isReadyToResume = 
        currentSBalance >= requiredAmount && 
        availableUSDT >= requiredAmount && 
        requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (isReadyToResume) {
        log(`Fondos (SBalance y Real) recuperados/disponibles. Monto requerido (${requiredAmount.toFixed(2)} USDT). Volviendo a SHBUYING.`, 'success');
        
        // Transicionar a SHBUYING para que se reanude la lógica de cobertura (venta en corto).
        await updateBotState('SHBUYING', SSTATE); 
    } else {
         let reason = '';
         if (currentSBalance < requiredAmount) {
             reason = `Esperando reposición de SBalance asignado. (Requiere: ${requiredAmount.toFixed(2)}, Actual: ${currentSBalance.toFixed(2)})`;
         } else {
             reason = `Esperando reposición de Fondos Reales. (Requiere: ${requiredAmount.toFixed(2)}, Actual: ${availableUSDT.toFixed(2)})`;
         }
         log(reason, 'info');
    }
}

module.exports = { run };