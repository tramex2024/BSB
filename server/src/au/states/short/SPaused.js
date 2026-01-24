// BSB/server/src/au/states/short/SPaused.js

const { calculateShortTargets } = require('../../../../autobotCalculations');
const MIN_USDT_VALUE_FOR_BITMART = 5.0;

async function run(dependencies) {
    const { 
        botState, currentPrice, config, 
        updateBotState, updateSStateData,
        updateGeneralBotState, log, 
        availableUSDT: realUSDT 
    } = dependencies;
    
    const availableUSDT = parseFloat(realUSDT || 0);
    const currentSBalance = parseFloat(botState.sbalance || 0);

    // ✅ MIGRADO: Uso de siglas de raíz
    const ac = parseFloat(botState.sac || 0); 
    const ppc = parseFloat(botState.sppc || 0);
    const orderCountInCycle = parseInt(botState.socc || 0);
    const targetPrice = parseFloat(botState.spc || botState.stprice || 0);

    // --- 1. ¿PODEMOS CERRAR CON PROFIT? ---
    if (ac > 0 && targetPrice > 0 && currentPrice <= targetPrice) {
        log(`🚀 [S-RECOVERY] ¡Precio en zona de profit (${currentPrice.toFixed(2)})! Saliendo a BUYING.`, 'success');
        await updateBotState('BUYING', 'short'); 
        return;
    }

    // --- 2. RECALCULO DE REQUERIMIENTOS ---
    // Siguiendo el orden de autobotCalculations: lastPrice (ppc), profit_percent, price_var, size_var, orderCount, baseAmount
    const recalculation = calculateShortTargets(
        ppc || currentPrice,
        config.short?.trigger || 0,
        config.short?.price_var || 0,
        config.short?.size_var || 0,
        orderCountInCycle || 0,
        parseFloat(config.short?.purchaseUsdt || 0)
    );

    const requiredAmount = recalculation.requiredCoverageAmount;

    // ✅ MIGRADO: Actualizamos las siglas de raíz sncp (next price) y srca (required amount)
    await updateSStateData({ 
        srca: requiredAmount, 
        sncp: recalculation.nextCoveragePrice 
    });

    // --- 3. RESETEO CRÍTICO DE INDICADORES ---
    if (ac <= 0 && currentSBalance < requiredAmount && botState.snorder !== 0) {
        log(`[S-RESET] Limpiando indicadores Short: SBalance (${currentSBalance.toFixed(2)}) insuficiente.`, 'warning');
        await updateGeneralBotState({ scoverage: 0, snorder: 0 }); 
        return; 
    }

    // --- 4. VERIFICACIÓN DE TRANSICIÓN ---
    const canResume = currentSBalance >= requiredAmount && 
                      availableUSDT >= requiredAmount && 
                      requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (canResume) {
        log(`✅ [S-FONDOS] Capital Short restaurado (${availableUSDT.toFixed(2)} USDT). Volviendo a SELLING...`, 'success');
        await updateBotState('SELLING', 'short');
    } else {
        const sizeInfo = config.short?.size_var || 0;
        log(`[S-PAUSED] Esperando... Balance: ${currentSBalance.toFixed(2)} | Necesita: ${requiredAmount.toFixed(2)} (Var: ${sizeInfo}%)`, 'debug');
    }
} 

module.exports = { run };