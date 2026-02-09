//BSB/server/src/au/states/long/LPaused.js

/**
 * L-PAUSED STATE:
 * Gestiona la espera por fondos insuficientes y la recuperación del ciclo.
 */

const { calculateLongTargets } = require('../../../../autobotCalculations');
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
    // Si el precio sube mientras estamos pausados, permitimos vender lo acumulado.
    if (ac > 0 && botState.ltprice > 0 && currentPrice >= botState.ltprice) {
        log(`🚀 [L-RECOVERY] ¡Precio alcanzado (${botState.ltprice.toFixed(2)})! Saliendo de pausa para VENDER.`, 'success');
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. RECALCULAR REQUERIMIENTOS ---
    // Recalculamos basándonos en la configuración dinámica del usuario.
    const recalculation = calculateLongTargets(
        ppc, 
        config.long, 
        orderCountInCycle
    );

    const requiredAmount = recalculation.requiredCoverageAmount;

    // Sincronizamos los indicadores de "Siguiente Compra" en el documento del usuario.
    await updateGeneralBotState({ 
        lrca: requiredAmount, 
        lncp: recalculation.nextCoveragePrice 
    });

    // --- 3. RESET DE INDICADORES (Si no hay fondos ni posición) ---
    if (ac <= 0 && currentLBalance < requiredAmount && botState.lnorder !== 0) {
        log(`[L-RESET] Limpiando indicadores: Saldo insuficiente para iniciar nueva orden.`, 'warning');
        await updateGeneralBotState({ lcoverage: 0, lnorder: 0 }); 
        return; 
    }

    // --- 4. VERIFICACIÓN DE REANUDACIÓN ---
    // Verificamos tanto el lbalance (interno) como el availableUSDT (real en Exchange).
    const canResume = currentLBalance >= requiredAmount && 
                      availableUSDT >= requiredAmount && 
                      requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (canResume) {
        log(`✅ [L-FUNDS] Capital recuperado (${availableUSDT.toFixed(2)} USDT). Reanudando COMPRAS...`, 'success');
        await updateBotState('BUYING', 'long');
    } else {
        // Log informativo que solo verá este usuario en su consola/celular.
        log(`[L-PAUSED] ⏸️ Esperando fondos | Disponible: ${currentLBalance.toFixed(2)} | Requerido: ${requiredAmount.toFixed(2)} | Orden: #${orderCountInCycle + 1}`, 'debug');
    }
} 

module.exports = { run };