// BSB/server/src/au/states/short/SNoCoverage.js

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
    const sStateData = botState.sStateData || {}; // Acceso seguro
    const { ac, ppc, orderCountInCycle } = sStateData;
    const currentSBalance = parseFloat(botState.sbalance || 0);

    // --- 1. ¿PODEMOS CERRAR CON PROFIT? (Vigilancia de Suelo) ---
    if (ac > 0 && botState.stprice > 0 && currentPrice <= botState.stprice) {
        log(`🚀 [S-RECOVERY] ¡Precio en zona de profit (${currentPrice.toFixed(2)})! Saliendo a BUYING.`, 'success');
        await updateBotState('BUYING', 'short'); 
        return;
    }

    // --- 2. RECALCULO DE REQUERIMIENTOS (Ajustado a nueva DB) ---
    const recalculation = calculateShortTargets(
        ppc || 0,
        config.short?.trigger || 0,        // ✅ CORREGIDO: Antes profit_percent
        config.short?.price_var || 0,      // ✅ Estructura jerárquica
        config.short?.size_var || 0,       // ✅ Estructura jerárquica
        config.short?.purchaseUsdt || 0,   // ✅ Estructura jerárquica
        orderCountInCycle || 0,
        currentSBalance
    );

    const requiredAmount = recalculation.requiredCoverageAmount;

    // Actualizamos la "brújula" interna del Short
    await updateSStateData({ 
        requiredCoverageAmount: requiredAmount, 
        nextCoveragePrice: recalculation.nextCoveragePrice 
    });

    // --- 3. RESETEO CRÍTICO DE INDICADORES ---
    if (ac <= 0 && currentSBalance < requiredAmount && botState.snorder !== 0) {
        log(`[S-RESET] Limpiando indicadores Short: SBalance (${currentSBalance.toFixed(2)}) insuficiente.`, 'warning');
        await updateGeneralBotState({ scoverage: 0, snorder: 0 }); 
        return; 
    }

    // --- 4. VERIFICACIÓN DE TRANSICIÓN (Recuperación de Fondos) ---
    const canResume = currentSBalance >= requiredAmount && 
                      availableUSDT >= requiredAmount && 
                      requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (canResume) {
        log(`✅ [S-FONDOS] Capital Short restaurado (${availableUSDT.toFixed(2)} USDT). Volviendo a SELLING...`, 'success');
        await updateBotState('SELLING', 'short');
    } else {
        // Log de monitoreo con acceso seguro a la variable exponencial para el debug
        const sizeInfo = config.short?.size_var || 0;
        log(`[S-NO_COVERAGE] Esperando... Balance: ${currentSBalance.toFixed(2)} | Necesita: ${requiredAmount.toFixed(2)} (Var: ${sizeInfo}%)`, 'debug');
    }
} 

module.exports = { run };