// BSB/server/src/au/states/long/LNoCoverage.js

const { calculateLongTargets } = require('../../../../autobotCalculations');
const MIN_USDT_VALUE_FOR_BITMART = 5.0;

async function run(dependencies) {
    const { 
        botState, currentPrice, config, 
        updateBotState, updateLStateData,
        getBotState, updateGeneralBotState, 
        log, availableUSDT: realUSDT
    } = dependencies;
    
    const availableUSDT = parseFloat(realUSDT || 0);
    const { ac, ppc, orderCountInCycle } = botState.lStateData;
    const currentLBalance = parseFloat(botState.lbalance || 0);

    // --- 1. ¿PODEMOS VENDER AUNQUE NO TENGAMOS FONDOS PARA COMPRAR? ---
    // Si el precio sube y toca el Take Profit (ltprice), volvemos a SELLING.
    if (ac > 0 && botState.ltprice > 0 && currentPrice >= botState.ltprice) {
        log(`🚀 [L-RECOVERY] ¡Precio alcanzó objetivo (${botState.ltprice.toFixed(2)})! Saliendo de NO_COVERAGE hacia SELLING.`, 'success');
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. RECALCULO DE REQUERIMIENTOS ---
    // Mantenemos actualizados los targets por si cambias la configuración en vivo.
    const recalculation = calculateLongTargets(
        ppc || 0,
        config.long.profit_percent || 0,
        config.long.price_var || 0,
        config.long.size_var || 0,
        config.long.purchaseUsdt || 0,
        orderCountInCycle || 0,
        currentLBalance
    );

    const requiredAmount = recalculation.requiredCoverageAmount;

    // Actualizamos el estado interno con los nuevos cálculos de la "brújula"
    await updateLStateData({ 
        requiredCoverageAmount: requiredAmount, 
        nextCoveragePrice: recalculation.nextCoveragePrice 
    });

    // --- 3. RESETEO CRÍTICO DE INDICADORES (Si no hay fondos y no hay posición) ---
    // Si no tienes BTC y no tienes dinero para la primera compra, ponemos el contador a 0.
    if (ac <= 0 && currentLBalance < requiredAmount && botState.lnorder !== 0) {
        log(`[L-RESET] Limpiando indicadores: LBalance (${currentLBalance.toFixed(2)}) < Mínimo (${requiredAmount.toFixed(2)}).`, 'warning');
        await updateGeneralBotState({ lcoverage: 0, lnorder: 0 }); 
        return; 
    }

    // --- 4. VERIFICACIÓN DE TRANSICIÓN (¿Ya hay dinero?) ---
    const canResume = currentLBalance >= requiredAmount && 
                      availableUSDT >= requiredAmount && 
                      requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (canResume) {
        log(`✅ [L-FONDOS] Capital recuperado (${availableUSDT.toFixed(2)} USDT). Reanudando BUYING...`, 'success');
        await updateBotState('BUYING', 'long');
    } else {
        // Log de monitoreo cada ciclo (Debug para no saturar)
        log(`[L-NO_COVERAGE] En espera... Saldo Bot: ${currentLBalance.toFixed(2)} | Real: ${availableUSDT.toFixed(2)} | Necesita: ${requiredAmount.toFixed(2)}`, 'debug');
    }
} 

module.exports = { run };