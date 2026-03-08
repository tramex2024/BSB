/**
 * S-PAUSED STATE (SHORT):
 * Manages the wait when capital is insufficient for the next DCA.
 * AUDIT 2026: Fixed to validate BTC balance for Spot Shorting.
 */

const { calculateShortTargets, calculateShortCoverage } = require('../../../../autobotCalculations');
const MIN_USDT_VALUE_FOR_BITMART = 5.0;

async function run(dependencies) {
    const { 
        userId, 
        botState, currentPrice, config, 
        updateBotState, updateSStateData,
        updateGeneralBotState, log, 
        availableUSDT: realUSDT,
        availableBTC: realBTC // 🟢 AUDIT: Injecting BTC balance for Sell validation
    } = dependencies;
    
    if (!currentPrice || currentPrice <= 0) return;

    const availableUSDT = parseFloat(realUSDT || 0);
    const availableBTC = parseFloat(realBTC || 0); // 🟢 AUDIT: Current wallet BTC
    const currentSBalance = parseFloat(botState.sbalance || 0); // Bot's assigned USDT quota

    const ac = parseFloat(botState.sac || 0);  // Accumulated coins (Short position open)
    const ppc = parseFloat(botState.sppc || 0); // Average entry price
    const orderCountInCycle = parseInt(botState.socc || 0);
    
    const targetPrice = parseFloat(botState.spc || botState.stprice || 0);

    // --- 1. RECOVERY LOGIC (EXIT TO BUYING) ---
    if (ac > 0 && targetPrice > 0 && currentPrice <= targetPrice) {
        log(`🚀 [S-RECOVERY] Price in profit zone (${currentPrice.toFixed(2)}). Jumping to BUYING to close.`, 'success');
        await updateBotState('BUYING', 'short'); 
        return;
    }

    // --- 2. RECALCULATE REQUIREMENTS ---
    const recalculation = calculateShortTargets(
        ppc || currentPrice,
        config.short, 
        orderCountInCycle
    );

    const requiredAmountUsdt = recalculation.requiredCoverageAmount;

    const coverageInfo = calculateShortCoverage(
        currentSBalance,
        currentPrice, 
        config.short.purchaseUsdt,
        (config.short.price_var / 100),
        parseFloat(config.short.size_var || 0),
        orderCountInCycle,
        (config.short.price_step_inc / 100)
    );

    await updateGeneralBotState({ 
        srca: requiredAmountUsdt, 
        sncp: recalculation.nextCoveragePrice,
        scoverage: coverageInfo.coveragePrice,
        snorder: coverageInfo.numberOfOrders
    });

    // --- 3. RESET INDICATORS (If no position and no quota) ---
    if (ac <= 0 && currentSBalance < (config.short.purchaseUsdt || MIN_USDT_VALUE_FOR_BITMART)) {
        if (botState.scoverage !== 0) {
            log(`[S-RESET] No funds for new Short opening. Clearing visual projection.`, 'warning');
            await updateGeneralBotState({ scoverage: 0, snorder: 0 }); 
        }
        return; 
    }

    // --- 4. RESUMPTION VERIFICATION (SPOT SHORT FIX) ---
    // 🟢 AUDIT: To sell (Short DCA), we need BTC. 
    // We convert the required USDT amount to the BTC quantity needed at current price.
    const btcNeeded = requiredAmountUsdt / currentPrice;

    const hasBotQuota = currentSBalance >= requiredAmountUsdt;
    const hasRealBTC = availableBTC >= btcNeeded;
    const meetsMinOrder = requiredAmountUsdt >= MIN_USDT_VALUE_FOR_BITMART;

    if (hasBotQuota && hasRealBTC && meetsMinOrder) {
        log(`✅ [S-FUNDS] BTC Balance recovered (${availableBTC.toFixed(6)} BTC). Resuming DCA in SELLING...`, 'success');
        await updateBotState('SELLING', 'short');
    } else {
        if (!hasRealBTC && requiredAmountUsdt > 0) {
            const missingBTC = (btcNeeded - availableBTC).toFixed(6);
            // Low level console log to avoid spamming the user UI
            console.log(`[User: ${userId}] [S-PAUSED] Waiting for BTC: Missing ${missingBTC} BTC`);
        }
    }
} 

module.exports = { run };