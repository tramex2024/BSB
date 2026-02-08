//BSB/server/src/au/states/long/LPaused.js

/**
 * L-PAUSED STATE:
 * Gestiona la espera por fondos insuficientes y la recuperación del ciclo.
 */

const { calculateLongTargets } = require('../../../../autobotCalculations');
const MIN_USDT_VALUE_FOR_BITMART = 5.0;

async function run(dependencies) {
    const { 
        userId, // <--- IDENTIDAD INYECTADA
        botState, currentPrice, config, 
        updateBotState, updateLStateData,
        updateGeneralBotState, 
        log, availableUSDT: realUSDT
    } = dependencies;
    
    const availableUSDT = parseFloat(realUSDT || 0);
    const currentLBalance = parseFloat(botState.lbalance || 0);

    const ac = parseFloat(botState.lac || 0);
    const ppc = parseFloat(botState.lppc || 0);
    const orderCountInCycle = parseInt(botState.locc || 0);

    // --- 1. RECOVERY LOGIC (EXIT TO SELLING) ---
    // Si el precio sube mientras estamos pausados por falta de dinero, 
    // permitimos que el bot intente vender lo que ya tiene.
    if (ac > 0 && botState.ltprice > 0 && currentPrice >= botState.ltprice) {
        log(`🚀 [L-RECOVERY] Target reached (${botState.ltprice.toFixed(2)})! Switching to SELLING.`, 'success');
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. CALCULATE REQUIREMENTS ---
    // Recalculamos basándonos en la configuración específica de este usuario
    const recalculation = calculateLongTargets(
        ppc, 
        config.long, 
        orderCountInCycle
    );

    const requiredAmount = recalculation.requiredCoverageAmount;

    // Actualizamos solo el documento del usuario actual
    await updateGeneralBotState({ 
        lrca: requiredAmount, 
        lncp: recalculation.nextCoveragePrice 
    });

    // --- 3. INDICATORS RESET ---
    if (ac <= 0 && currentLBalance < requiredAmount && botState.lnorder !== 0) {
        log(`[L-RESET] Cleaning indicators: LBalance (${currentLBalance.toFixed(2)}) < Required (${requiredAmount.toFixed(2)}).`, 'warning');
        await updateGeneralBotState({ lcoverage: 0, lnorder: 0 }); 
        return; 
    }

    // --- 4. RESUME VERIFICATION ---
    const canResume = currentLBalance >= requiredAmount && 
                      availableUSDT >= requiredAmount && 
                      requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (canResume) {
        log(`✅ [L-FUNDS] Capital recovered (${availableUSDT.toFixed(2)} USDT). Resuming BUYING...`, 'success');
        await updateBotState('BUYING', 'long');
    } else {
        // Log individualizado que aparecerá solo en el Dashboard del usuario afectado
        log(`[L-PAUSED] ⏸️ Waiting for Funds | Balance: ${currentLBalance.toFixed(2)} | Required: ${requiredAmount.toFixed(2)} | Next Order: #${orderCountInCycle + 1}`, 'debug');
    }
} 

module.exports = { run };