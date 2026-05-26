/**
 * S-PAUSED STATE (SHORT):
 * Gestiona la espera cuando el capital es insuficiente para el siguiente DCA.
 * Corregido: Sincronización de cobertura con precio de mercado real (2026).
 */

const { calculateShortTargets, calculateShortCoverage } = require('../../../autobotCalculations');
const MIN_USDT_VALUE_FOR_BITMART = 5.0;

async function run(dependencies) {
    const { 
        userId, 
        botState, currentPrice, config, 
        updateBotState, updateSStateData,
        updateGeneralBotState, log, 
        availableUSDT: realUSDT 
    } = dependencies;
    
    if (!currentPrice || currentPrice <= 0) return;

    const availableUSDT = parseFloat(realUSDT || 0);
    const currentSBalance = parseFloat(botState.sbalance || 0);

    const ac = parseFloat(botState.sac || 0);  // Monedas vendidas (posición Short abierta)
    const ppc = parseFloat(botState.sppc || 0); // Precio promedio de venta
    const orderCountInCycle = parseInt(botState.socc || 0);
    
    // Priorizamos el Stop de recompra (PC) del Trailing si existe
    const targetPrice = parseFloat(botState.spc || botState.stprice || 0);

    // --- 1. LÓGICA DE RECUPERACIÓN (SALIDA A BUYING) ---
    // Si el precio cae a zona de profit, podemos cerrar independientemente del balance
    if (ac > 0 && targetPrice > 0 && currentPrice <= targetPrice) {
        log(`🚀 [S-RECOVERY] Precio en zona de profit (${currentPrice.toFixed(2)}). Saltando a BUYING para cerrar.`, 'success');
        await updateBotState('BUYING', 'short'); 
        return;
    }

    // --- 2. RECALCULAR REQUERIMIENTOS Y PROYECCIÓN ---
    const recalculation = calculateShortTargets(
        ppc || currentPrice,
        config.short, 
        orderCountInCycle
    );

    const requiredAmount = recalculation.requiredCoverageAmount;

    /**
     * ACTUALIZACIÓN CRÍTICA:
     * Usamos currentPrice SIEMPRE para la cobertura visual.
     * En Short, esto proyecta hasta qué precio de SUBIDA aguanta la posición 
     * tomando como base el precio actual del mercado.
     */
    const coverageInfo = calculateShortCoverage(
        currentSBalance,
        currentPrice, // <--- Eliminamos botState.slep para asegurar tiempo real
        config.short.purchaseUsdt,
        (config.short.price_var / 100),
        parseFloat(config.short.size_var || 0),
        orderCountInCycle,
        (config.short.price_step_inc / 100)
    );

    // Actualizamos indicadores Short para limpiar valores basura de la DB
    await updateGeneralBotState({ 
        srca: requiredAmount, 
        sncp: recalculation.nextCoveragePrice,
        scoverage: coverageInfo.coveragePrice,
        snorder: coverageInfo.numberOfOrders
    });

    // --- 3. RESET DE INDICADORES (Si no hay posición y no hay fondos) ---
    if (ac <= 0 && currentSBalance < (config.short.purchaseUsdt || MIN_USDT_VALUE_FOR_BITMART)) {
        if (botState.scoverage !== 0) {
            log(`[S-RESET] Sin fondos para nueva apertura Short. Limpiando proyección visual.`, 'warning');
            await updateGeneralBotState({ scoverage: 0, snorder: 0 }); 
        }
        return; 
    }

    // --- 4. VERIFICACIÓN DE REANUDACIÓN ---
    const canResume = currentSBalance >= requiredAmount && 
                      availableUSDT >= requiredAmount && 
                      requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (canResume) {
        log(`✅ [S-FUNDS] Capital recuperado (${availableUSDT.toFixed(2)} USDT). Reanudando DCA en SELLING...`, 'success');
        await updateBotState('SELLING', 'short');
    } else {
        const missing = (requiredAmount - Math.min(availableUSDT, currentSBalance)).toFixed(2);
        // Log informativo de bajo nivel
        console.log(`[User: ${userId}] [S-PAUSED] Esperando fondos: Faltan ${missing} USDT`);
    }
} 

module.exports = { run };