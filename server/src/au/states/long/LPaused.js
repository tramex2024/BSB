/**
 * L-PAUSED STATE:
 * Gestiona la espera por fondos insuficientes y la recuperación del ciclo.
 * Corregido: Sincronización de cobertura con precio de mercado real (2026).
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
    // Calculamos los objetivos basados en la configuración actual
    const recalculation = calculateLongTargets(
        ppc, 
        config.long, 
        orderCountInCycle
    );

    const requiredAmount = recalculation.requiredCoverageAmount;

    /**
     * ACTUALIZACIÓN CRÍTICA: 
     * Usamos currentPrice SIEMPRE para la cobertura visual. 
     * Esto elimina el valor "congelado" de 83k si el llep era antiguo.
     */
    const coverageInfo = calculateLongCoverage(
        currentLBalance,
        currentPrice, // <--- Prioridad total al mercado actual
        config.long.purchaseUsdt,
        (config.long.price_var / 100),
        parseFloat(config.long.size_var || 0),
        orderCountInCycle,
        (config.long.price_step_inc / 100)
    );

    // Sincronizamos indicadores para que el usuario vea la realidad del mercado
    await updateGeneralBotState({ 
        lrca: requiredAmount, 
        lncp: recalculation.nextCoveragePrice,
        lcoverage: coverageInfo.coveragePrice,
        lnorder: coverageInfo.numberOfOrders
    });

    // --- 3. RESET DE INDICADORES (Si no hay posición activa y no hay fondos) ---
    if (ac <= 0 && currentLBalance < (config.long.purchaseUsdt || MIN_USDT_VALUE_FOR_BITMART)) {
        if (botState.lcoverage !== 0) {
            log(`[L-RESET] Sin fondos suficientes para nueva orden. Limpiando proyección visual.`, 'warning');
            await updateGeneralBotState({ lcoverage: 0, lnorder: 0 }); 
        }
        return; 
    }

    // --- 4. VERIFICACIÓN DE REANUDACIÓN ---
    // Verificamos que tanto el balance asignado como el real en Bitmart permitan continuar
    const canResume = currentLBalance >= requiredAmount && 
                      availableUSDT >= requiredAmount && 
                      requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (canResume) {
        log(`✅ [L-FUNDS] Capital detectado (${availableUSDT.toFixed(2)} USDT). Reanudando COMPRAS...`, 'success');
        await updateBotState('BUYING', 'long');
    } else {
        // Log de bajo impacto para monitoreo en consola
        log(`[L-PAUSED] 👁️ Waiting for funds: ${currentLBalance.toFixed(2)}/${requiredAmount.toFixed(2)} USDT`, 'debug');
    }
} 

module.exports = { run };