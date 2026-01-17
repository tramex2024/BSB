// BSB/server/src/au/states/long/LNoCoverage.js

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
    const lStateData = botState.lStateData || {};
    const { ac, ppc, orderCountInCycle } = lStateData;
    const currentLBalance = parseFloat(botState.lbalance || 0);

    // --- 1. ¿PODEMOS VENDER AUNQUE NO TENGAMOS FONDOS PARA COMPRAR? ---
    if (ac > 0 && botState.ltprice > 0 && currentPrice >= botState.ltprice) {
        log(`🚀 [L-RECOVERY] ¡Precio alcanzó objetivo (${botState.ltprice.toFixed(2)})! Volviendo a SELLING.`, 'success');
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. RECALCULO DE REQUERIMIENTOS (Ajustado a la nueva DB) ---
    // Usamos config.long.trigger en lugar de profit_percent
    const recalculation = calculateLongTargets(
        ppc || 0,
        config.long?.trigger || 0,       // ✅ CORREGIDO: Antes profit_percent
        config.long?.price_var || 0,     // ✅ Estructura jerárquica
        config.long?.size_var || 0,      // ✅ Estructura jerárquica
        config.long?.purchaseUsdt || 0,  // ✅ Estructura jerárquica
        orderCountInCycle || 0,
        currentLBalance
    );

    const requiredAmount = recalculation.requiredCoverageAmount;

    // Actualizamos el estado interno con los nuevos cálculos
    await updateLStateData({ 
        requiredCoverageAmount: requiredAmount, 
        nextCoveragePrice: recalculation.nextCoveragePrice 
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
        // Log de monitoreo (uso de optional chaining para evitar errores si config no existe)
        const sizeInfo = config.long?.size_var || 0;
        log(`[L-NO_COVERAGE] En espera... Saldo: ${currentLBalance.toFixed(2)} | Necesita: ${requiredAmount.toFixed(2)} (Var: ${sizeInfo}%)`, 'debug');
    }
} 

module.exports = { run };