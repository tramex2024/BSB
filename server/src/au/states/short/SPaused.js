//BSB/server/src/au/states/short/SPaused.js

/**
 * S-PAUSED STATE (SHORT):
 * Gestiona la espera por fondos insuficientes para cubrir el DCA del Short.
 */

const { calculateShortTargets } = require('../../../../autobotCalculations');
const MIN_USDT_VALUE_FOR_BITMART = 5.0;

async function run(dependencies) {
    const { 
        userId, // <--- IDENTIDAD INYECTADA
        botState, currentPrice, config, 
        updateBotState, updateSStateData,
        updateGeneralBotState, log, 
        availableUSDT: realUSDT 
    } = dependencies;
    
    const availableUSDT = parseFloat(realUSDT || 0);
    const currentSBalance = parseFloat(botState.sbalance || 0);

    // ✅ MIGRATED: Uso de acrónimos en raíz
    const ac = parseFloat(botState.sac || 0); 
    const ppc = parseFloat(botState.sppc || 0);
    const orderCountInCycle = parseInt(botState.socc || 0);
    const targetPrice = parseFloat(botState.spc || botState.stprice || 0);

    // --- 1. RECOVERY LOGIC (EXIT TO BUYING) ---
    // Si el precio cae a la zona de ganancias mientras estamos pausados,
    // permitimos que el bot salte a BUYING para intentar cerrar con Trailing.
    if (ac > 0 && targetPrice > 0 && currentPrice <= targetPrice) {
        log(`🚀 [S-RECOVERY] Price in profit zone (${currentPrice.toFixed(2)})! Switching to BUYING.`, 'success');
        await updateBotState('BUYING', 'short'); 
        return;
    }

    // --- 2. CALCULATE REQUIREMENTS ---
    // Recalculamos basándonos en la configuración específica de este usuario
    const recalculation = calculateShortTargets(
        ppc || currentPrice,
        config.short, 
        orderCountInCycle
    );

    const requiredAmount = recalculation.requiredCoverageAmount;

    // ✅ MIGRATED: Actualizamos srca (required amount) y sncp (next price) solo para este bot
    await updateSStateData({ 
        srca: requiredAmount, 
        sncp: recalculation.nextCoveragePrice 
    });

    // --- 3. INDICATORS RESET ---
    if (ac <= 0 && currentSBalance < requiredAmount && botState.snorder !== 0) {
        log(`[S-RESET] Cleaning Short indicators: SBalance (${currentSBalance.toFixed(2)}) insufficient.`, 'warning');
        await updateGeneralBotState({ scoverage: 0, snorder: 0 }); 
        return; 
    }

    // --- 4. RESUME VERIFICATION ---
    const canResume = currentSBalance >= requiredAmount && 
                      availableUSDT >= requiredAmount && 
                      requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (canResume) {
        log(`✅ [S-FUNDS] Short capital restored (${availableUSDT.toFixed(2)} USDT). Returning to SELLING...`, 'success');
        await updateBotState('SELLING', 'short');
    } else {
        // Log individualizado para el dashboard del usuario
        log(`[S-PAUSED] ⏸️ Waiting for Funds | Balance: ${currentSBalance.toFixed(2)} | Required: ${requiredAmount.toFixed(2)} | Next Order: #${orderCountInCycle + 1}`, 'debug');
    }
} 

module.exports = { run };