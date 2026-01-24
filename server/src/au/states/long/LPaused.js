// BSB/server/src/au/states/long/LPaused.js

const { calculateLongTargets } = require('../../../../autobotCalculations');
const MIN_USDT_VALUE_FOR_BITMART = 5.0;

async function run(dependencies) {
    const { 
        botState, currentPrice, config, 
        updateBotState, updateLStateData,
        updateGeneralBotState, 
        log, availableUSDT: realUSDT
    } = dependencies;
    
    const availableUSDT = parseFloat(realUSDT || 0);
    const currentLBalance = parseFloat(botState.lbalance || 0);

    // ✅ MIGRADO: Referencias directas a raíz
    const ac = parseFloat(botState.lac || 0);
    const ppc = parseFloat(botState.lppc || 0);
    const orderCountInCycle = parseInt(botState.locc || 0);

    // --- 1. ¿PODEMOS VENDER AUNQUE NO TENGAMOS FONDOS PARA COMPRAR? ---
    // Si el precio sube y toca el target, salimos del modo espera hacia SELLING
    if (ac > 0 && botState.ltprice > 0 && currentPrice >= botState.ltprice) {
        log(`🚀 [L-RECOVERY] ¡Precio alcanzó objetivo (${botState.ltprice.toFixed(2)})! Volviendo a SELLING.`, 'success');
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. RECALCULO DE REQUERIMIENTOS (Ajustado a siglas de raíz) ---
    const recalculation = calculateLongTargets(
        ppc,
        config.long?.trigger || 0,
        config.long?.price_var || 0,
        config.long?.size_var || 0,
        config.long?.purchaseUsdt || 0,
        orderCountInCycle,
        currentLBalance
    );

    const requiredAmount = recalculation.requiredCoverageAmount;

    // ✅ ACTUALIZACIÓN EN RAÍZ: lrca (Required Amount) y lncp (Next Coverage Price)
    await updateGeneralBotState({ 
        lrca: requiredAmount, 
        lncp: recalculation.nextCoveragePrice 
    });

    // --- 3. RESETEO CRÍTICO DE INDICADORES ---
    if (ac <= 0 && currentLBalance < requiredAmount && botState.lnorder !== 0) {
        log(`[L-RESET] Limpiando indicadores: LBalance (${currentLBalance.toFixed(2)}) < Mínimo (${requiredAmount.toFixed(2)}).`, 'warning');
        await updateGeneralBotState({ lcoverage: 0, lnorder: 0 }); 
        return; 
    }

    // --- 4. VERIFICACIÓN DE TRANSICIÓN ---
    const canResume = currentLBalance >= requiredAmount && 
                      availableUSDT >= requiredAmount && 
                      requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (canResume) {
        log(`✅ [L-FONDOS] Capital recuperado (${availableUSDT.toFixed(2)} USDT). Reanudando BUYING...`, 'success');
        await updateBotState('BUYING', 'long');
    } else {
        const sizeInfo = config.long?.size_var || 0;
        log(`[L-PAUSED] En espera... Saldo: ${currentLBalance.toFixed(2)} | Necesita: ${requiredAmount.toFixed(2)} (Sig. Orden #${orderCountInCycle + 1})`, 'debug');
    }
} 

module.exports = { run };