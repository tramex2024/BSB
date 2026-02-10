// BSB/server/src/au/states/long/LPaused.js

/**
 * L-PAUSED STATE:
 * Gestiona la espera por fondos insuficientes y la recuperación del ciclo.
 */

const { calculateLongTargets, calculateLongCoverage } = require('../../../../autobotCalculations');
const MIN_USDT_VALUE_FOR_BITMART = 5.0;

async function run(dependencies) {
    const { 
        userId, 
        botState, 
        currentPrice, 
        config, 
        updateBotState, 
        updateGeneralBotState, 
        log, 
        availableUSDT: realUSDT 
    } = dependencies;
    
    const availableUSDT = parseFloat(realUSDT || 0);
    const currentLBalance = parseFloat(botState.lbalance || 0);

    const ac = parseFloat(botState.lac || 0);
    const ppc = parseFloat(botState.lppc || 0);
    const orderCountInCycle = parseInt(botState.locc || 0);

    // --- 1. RECOVERY LOGIC (EXIT TO SELLING) ---
    // Si el precio alcanza el TP proyectado, salimos a vender lo que tengamos
    if (ac > 0 && botState.ltprice > 0 && currentPrice >= botState.ltprice) {
        log(`🚀 [L-RECOVERY] ¡Precio TP alcanzado (${botState.ltprice.toFixed(2)})! Saliendo de pausa para VENDER.`, 'success');
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. RECALCULAR TARGETS Y COBERTURA ---
    // Importante: Usamos la config actual por si el usuario la cambió mientras estaba en pausa
    const recalculation = calculateLongTargets(
        ppc, 
        config.long, 
        orderCountInCycle
    );

    const requiredAmount = recalculation.requiredCoverageAmount;

    // Actualizamos la cobertura visual para el Dashboard
    const coverageInfo = calculateLongCoverage(
        currentLBalance,
        botState.llep || currentPrice,
        config.long.purchaseUsdt,
        (config.long.price_var / 100),
        parseFloat(config.long.size_var || 0),
        orderCountInCycle,
        (config.long.price_step_inc / 100)
    );

    // Sincronizamos indicadores para que el usuario vea cuánto le falta para reanudar
    await updateGeneralBotState({ 
        lrca: requiredAmount, 
        lncp: recalculation.nextCoveragePrice,
        lcoverage: coverageInfo.coveragePrice,
        lnorder: coverageInfo.numberOfOrders
    });

    // --- 3. RESET DE INDICADORES (Si no hay posición activa) ---
    if (ac <= 0 && currentLBalance < (config.long.purchaseUsdt || MIN_USDT_VALUE_FOR_BITMART)) {
        if (botState.lcoverage !== 0) {
            log(`[L-RESET] Sin fondos para nueva orden inicial. Limpiando proyección.`, 'warning');
            await updateGeneralBotState({ lcoverage: 0, lnorder: 0 }); 
        }
        return; 
    }

    // --- 4. VERIFICACIÓN DE REANUDACIÓN ---
    // canResume ahora es más estricto: balance interno Y real en exchange deben cumplir
    const canResume = currentLBalance >= requiredAmount && 
                      availableUSDT >= requiredAmount && 
                      requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (canResume) {
        log(`✅ [L-FUNDS] Capital recuperado (${availableUSDT.toFixed(2)} USDT). Reanudando COMPRAS...`, 'success');
        await updateBotState('BUYING', 'long');
    } else {
        // Log informativo de bajo nivel (debug)
        log(`[L-PAUSED] ⏸️ Esperando fondos | Disp: ${currentLBalance.toFixed(2)} | Reqd: ${requiredAmount.toFixed(2)} | Sig. Orden: #${orderCountInCycle + 1}`, 'debug');
    }
} 

module.exports = { run };