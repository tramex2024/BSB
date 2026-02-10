// BSB/server/src/au/states/short/SPaused.js

/**
 * S-PAUSED STATE (SHORT):
 * Gestiona la espera cuando el capital es insuficiente para el siguiente DCA.
 * Monitoriza si el precio entra en zona de ganancia para cerrar la posición actual.
 */

const { calculateShortTargets, calculateShortCoverage } = require('../../../../autobotCalculations');
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

    const ac = parseFloat(botState.sac || 0);  // Monedas vendidas
    const ppc = parseFloat(botState.sppc || 0); // Precio promedio de venta
    const orderCountInCycle = parseInt(botState.socc || 0);
    
    // Priorizamos el Stop de recompra (PC) del Trailing si existe
    const targetPrice = parseFloat(botState.spc || botState.stprice || 0);

    // --- 1. LÓGICA DE RECUPERACIÓN (SALIDA A BUYING) ---
    // Si el precio cae a zona de profit, no importa si no hay balance para DCA, ¡podemos cerrar!
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

    // Calculamos la cobertura visual para que el usuario vea en el mapa hasta dónde aguanta su Short
    const coverageInfo = calculateShortCoverage(
        currentSBalance,
        botState.slep || currentPrice,
        config.short.purchaseUsdt,
        (config.short.price_var / 100),
        parseFloat(config.short.size_var || 0),
        orderCountInCycle,
        (config.short.price_step_inc / 100)
    );

    // Actualizamos indicadores Short en el documento del usuario
    await updateGeneralBotState({ 
        srca: requiredAmount, 
        sncp: recalculation.nextCoveragePrice,
        scoverage: coverageInfo.coveragePrice,
        snorder: coverageInfo.numberOfOrders
    });

    // --- 3. RESET DE INDICADORES ---
    if (ac <= 0 && currentSBalance < (config.short.purchaseUsdt || MIN_USDT_VALUE_FOR_BITMART)) {
        if (botState.scoverage !== 0) {
            log(`[S-RESET] Sin fondos para nueva apertura Short. Limpiando proyección.`, 'warning');
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
        log(`[S-PAUSED] ⏸️ Esperando fondos | Necesario: ${requiredAmount.toFixed(2)} | Falta: ${missing} USDT | DCA: #${orderCountInCycle + 1}`, 'debug');
    }
} 

module.exports = { run };