/**
 * BSB/server/src/states/long/LPaused.js
 * Manages waiting periods due to insufficient funds and cycle recovery.
 * Fixed: Coverage synchronization with real-time market price (2026).
 * Updated: Recovery logic now includes position validation before selling.
 */

const { calculateLongTargets, calculateLongCoverage } = require('../../../autobotCalculations');
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
    
    // SOLUTION: Global wrapper to prevent engine freezing due to minor errors
    try {
        if (!currentPrice || currentPrice <= 0) return;

        const availableUSDT = parseFloat(realUSDT || 0);
        const currentLBalance = parseFloat(botState.lbalance || 0);

        const ac = parseFloat(botState.lac || 0); // Coins accumulated (Long position)
        const ppc = parseFloat(botState.lppc || 0);
        const orderCountInCycle = parseInt(botState.locc || 0);

        // --- 1. RECOVERY LOGIC (EXIT TO SELLING) ---
        // Validate position exists before attempting to sell to avoid API errors
        const targetPrice = parseFloat(botState.ltprice || 0);
        if (ac > 0 && targetPrice > 0 && currentPrice >= targetPrice) {
            
            // Safety Check: Do we actually have the coins?
            if (ac > 0) {
                log(`🚀 [L-RECOVERY] TP Price reached (${targetPrice.toFixed(2)}). Position detected (${ac.toFixed(6)} BTC). Exiting pause to SELL.`, 'success');
                await updateBotState('SELLING', 'long'); 
                return;
            } else {
                log(`⚠️ [L-RECOVERY-BLOCKED] TP Price reached, but no position (ac: ${ac}) found to sell. Check data sync.`, 'error');
            }
        }

        // --- 2. RECALCULATE TARGETS AND COVERAGE ---
        const recalculation = calculateLongTargets(
            ppc, 
            config.long, 
            orderCountInCycle
        );

        const requiredAmount = parseFloat(recalculation.requiredCoverageAmount || 0);

        const coverageInfo = calculateLongCoverage(
            currentLBalance,
            currentPrice, 
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
        const initialPurchaseAmount = parseFloat(config.long.purchaseUsdt || 0);
        
        if (ac <= 0 && currentLBalance < (initialPurchaseAmount || MIN_USDT_VALUE_FOR_BITMART)) {
            if (parseFloat(botState.lcoverage || 0) !== 0) {
                log(`[L-RESET] Insufficient funds for a new order. Clearing visual projection.`, 'warning');
                await updateGeneralBotState({ lcoverage: 0, lnorder: 0 }); 
            }
            return; 
        }

        // --- 4. RESUMPTION VERIFICATION (LOCKUP BEHAVIOR SOLUTION) ---
        const amountNeededToResume = ac === 0 ? initialPurchaseAmount : requiredAmount;
        const finalMinLimit = Math.max(MIN_USDT_VALUE_FOR_BITMART, amountNeededToResume);

        const canResume = currentLBalance >= amountNeededToResume && 
                          availableUSDT >= amountNeededToResume && 
                          finalMinLimit >= MIN_USDT_VALUE_FOR_BITMART;

        if (canResume) {
            log(`✅ [L-FUNDS] Sufficient capital detected (${amountNeededToResume.toFixed(2)} USDT required). Resuming BUYING...`, 'success');
            await updateBotState('BUYING', 'long');
        } else {
            const missing = (amountNeededToResume - Math.min(availableUSDT, currentLBalance)).toFixed(2);
            const btcNeeded = (amountNeededToResume / currentPrice).toFixed(6);
            
            log(`[L-PAUSED] 👁️ Waiting for funds. Balance: ${currentLBalance.toFixed(2)} USDT | Required: ${amountNeededToResume.toFixed(2)} USDT (Poder de compra: ~${btcNeeded} BTC) | Missing: ${missing} USDT`, 'debug');
        }
        
    } catch (criticalError) {
        log(`🔥 [CRITICAL] Unexpected error inside LPaused state: ${criticalError.message}`, 'error');
    }
} 

module.exports = { run };