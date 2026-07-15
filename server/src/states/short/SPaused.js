/**
 * BSB/server/src/states/short/SPaused.js
 * Wait management when capital is insufficient for the next DCA.
 * Fixed: Coverage synchronization with real market price (2026).
 * Updated: Recovery logic now validates funds before transitioning to BUYING.
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
    
    // SOLUTION: Global wrapper to prevent freezing due to calculation errors or null data
    try {
        if (!currentPrice || currentPrice <= 0) return;

        const availableUSDT = parseFloat(realUSDT || 0);
        const currentSBalance = parseFloat(botState.sbalance || 0);

        const ac = parseFloat(botState.sac || 0);  // Coins sold (Short position open)
        const ppc = parseFloat(botState.sppc || 0); // Average selling price
        const orderCountInCycle = parseInt(botState.socc || 0);
        
        // Prioritize Trailing repurchase (PC) stop if it exists
        const targetPrice = parseFloat(botState.spc || botState.stprice || 0);

        // --- 1. RECOVERY LOGIC (EXIT TO BUYING) ---
        // Validate funds before closing the position to avoid failed API orders
        if (ac > 0 && targetPrice > 0 && currentPrice <= targetPrice) {
            const buybackCost = ac * currentPrice;
            
            if (availableUSDT >= buybackCost) {
                log(`🚀 [S-RECOVERY] Price in profit zone (${currentPrice.toFixed(2)}). Sufficient funds (${availableUSDT.toFixed(2)} USDT) to cover buyback. Jumping to BUYING to close position.`, 'success');
                await updateBotState('BUYING', 'short'); 
                return;
            } else {
                log(`⚠️ [S-RECOVERY-BLOCKED] Price in profit zone (${currentPrice.toFixed(2)}), but insufficient funds to close. Need: ${buybackCost.toFixed(2)} USDT | Available: ${availableUSDT.toFixed(2)} USDT`, 'warning');
            }
        }

        // --- 2. RECALCULATE REQUIREMENTS AND PROJECTION ---
        const recalculation = calculateShortTargets(
            ppc || currentPrice,
            config.short, 
            orderCountInCycle
        );

        const requiredAmount = parseFloat(recalculation.requiredCoverageAmount || 0);

        // SOLUTION: Sanitization of variables using safe parsing to avoid crashes from empty data
        const priceVar = parseFloat(config.short?.price_var || 0) / 100;
        const priceStepInc = parseFloat(config.short?.price_step_inc || 0) / 100;
        const initialPurchaseAmount = parseFloat(config.short?.purchaseUsdt || 0);

        const coverageInfo = calculateShortCoverage(
            currentSBalance,
            currentPrice, 
            initialPurchaseAmount,
            priceVar,
            parseFloat(config.short?.size_var || 0),
            orderCountInCycle,
            priceStepInc
        );

        // Update Short indicators to clean garbage values from DB
        await updateGeneralBotState({ 
            srca: requiredAmount, 
            sncp: recalculation.nextCoveragePrice,
            scoverage: coverageInfo.coveragePrice,
            snorder: coverageInfo.numberOfOrders
        });

        // --- 3. RESET INDICATORS (If no position and no funds) ---
        if (ac <= 0 && currentSBalance < (initialPurchaseAmount || MIN_USDT_VALUE_FOR_BITMART)) {
            if (parseFloat(botState.scoverage || 0) !== 0) {
                log(`[S-RESET] Insufficient funds for new Short opening. Clearing visual projection.`, 'warning');
                await updateGeneralBotState({ scoverage: 0, snorder: 0 }); 
            }
            return; 
        }

        // --- 4. RESUMPTION VERIFICATION (LOCKUP BEHAVIOR SOLUTION) ---
        // If the cycle is clear (ac === 0) we require the initial amount; if there is a pending DCA, we require requiredAmount
        const amountNeededToResume = ac === 0 ? initialPurchaseAmount : requiredAmount;
        const finalMinLimit = Math.max(MIN_USDT_VALUE_FOR_BITMART, amountNeededToResume);

        // LOG DE DIAGNÓSTICO: Esto nos dirá qué variable está fallando
        log(`[S-PAUSED DEBUG] Evaluating resumption: S-Balance: ${currentSBalance} | Available: ${availableUSDT} | Required: ${amountNeededToResume.toFixed(2)}`, 'debug');

        const canResume = currentSBalance >= amountNeededToResume && 
                          availableUSDT >= amountNeededToResume && 
                          finalMinLimit >= MIN_USDT_VALUE_FOR_BITMART;

        if (canResume) {
            log(`✅ [S-FUNDS] Capital recovered (${amountNeededToResume.toFixed(2)} USDT required). Resuming in SELLING...`, 'success');
            await updateBotState('SELLING', 'short');
        } else {
            const missing = (amountNeededToResume - Math.min(availableUSDT, currentSBalance)).toFixed(2);
            // Calculate BTC equivalent needed
            const btcNeeded = (amountNeededToResume / currentPrice).toFixed(6);
            
            log(`[S-PAUSED] 👁️ Waiting for funds. Balance: ${currentSBalance.toFixed(2)} USDT | Required: ${amountNeededToResume.toFixed(2)} USDT (~${btcNeeded} BTC) (Missing: ${missing} USDT)`, 'debug');
        }
    } catch (criticalError) {
        log(`🔥 [CRITICAL] Unexpected error within SPaused state: ${criticalError.message}`, 'error');
    }
} 

module.exports = { run };