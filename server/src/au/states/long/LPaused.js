/**
 * L-PAUSED STATE:
 * Manages waiting periods due to insufficient funds and cycle recovery.
 * Corrected: Coverage synchronization with real-time market price (2026).
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
    // If price reaches the projected TP, we exit to SELL whatever we currently hold.
    // This allows the bot to recover profitability even if it couldn't complete all DCA steps.
    const targetPrice = parseFloat(botState.ltprice || 0);
    if (ac > 0 && targetPrice > 0 && currentPrice >= targetPrice) {
        log(`🚀 [L-RECOVERY] TP Price reached (${targetPrice.toFixed(2)})! Exiting pause to SELL.`, 'success');
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. RECALCULATE TARGETS AND COVERAGE ---
    const recalculation = calculateLongTargets(
        ppc, 
        config.long, 
        orderCountInCycle
    );

    const requiredAmount = parseFloat(recalculation.requiredCoverageAmount || 0);

    /**
     * CRITICAL UPDATE: 
     * We ALWAYS use currentPrice for visual coverage. 
     * This eliminates "frozen" values if the last execution price was old.
     */
    const coverageInfo = calculateLongCoverage(
        currentLBalance,
        currentPrice, // <--- Total priority to current market price
        config.long.purchaseUsdt,
        (parseFloat(config.long.price_var || 0) / 100),
        parseFloat(config.long.size_var || 0),
        orderCountInCycle,
        (parseFloat(config.long.price_step_inc || 0) / 100)
    );

    // Sync indicators so the user sees real-time market reality
    await updateGeneralBotState({ 
        lrca: requiredAmount, 
        lncp: recalculation.nextCoveragePrice,
        lcoverage: coverageInfo.coveragePrice,
        lnorder: coverageInfo.numberOfOrders
    });

    // --- 3. INDICATORS RESET (If no active position and no funds) ---
    if (ac <= 0 && currentLBalance < (parseFloat(config.long.purchaseUsdt || 0) || MIN_USDT_VALUE_FOR_BITMART)) {
        if (parseFloat(botState.lcoverage || 0) !== 0) {
            log(`[L-RESET] Insufficient funds for a new order. Clearing visual projection.`, 'warning');
            await updateGeneralBotState({ lcoverage: 0, lnorder: 0 }); 
        }
        return; 
    }

    // --- 4. RESUMPTION VERIFICATION ---
    // Verification against realUSDT (Bitmart) and lbalance (Assigned in App)
    const canResume = currentLBalance >= requiredAmount && 
                      availableUSDT >= requiredAmount && 
                      requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (canResume) {
        log(`✅ [L-FUNDS] Capital detected (${availableUSDT.toFixed(2)} USDT). Resuming BUYING...`, 'success');
        await updateBotState('BUYING', 'long');
    } else {
        // Monitoring log (Heartbeat in Pause)
        log(`[L-PAUSED] 👁️ Waiting for funds: ${currentLBalance.toFixed(2)}/${requiredAmount.toFixed(2)} USDT`, 'debug');
    }
} 

module.exports = { run };