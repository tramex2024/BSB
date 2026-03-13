/**
 * STRATEGY VALIDATOR - BUDGET & LIQUIDITY ENGINE
 * Logic: Calculates "Net Available" by subtracting committed funds 
 * from active strategies to prevent over-allocation.
 */

/**
 * Generates a report for the UI Modal before starting the strategy.
 * This is the "Preview" logic.
 */
function getStartAnalysis(strategy, dependencies) {
    const { botState, availableUSDT, availableBTC, currentPrice } = dependencies;
    
    // 1. Calculate committed funds (Same logic as validator)
    let committedUSDT = 0;
    if (botState.lstate !== 'STOPPED') committedUSDT += parseFloat(botState.lbalance || 0);
    if (botState.aistate !== 'STOPPED') committedUSDT += parseFloat(botState.aibalance || 0);
    
    const netAvailableUSDT = availableUSDT - committedUSDT;
    const config = botState.config[strategy] || {};

    // 2. Coverage Calculation (Price Variation)
    // Formula: (Price Var % * Max Orders) = Total Coverage
    const priceVar = parseFloat(config.price_var || 0);
    const amountUsdt = parseFloat(config.amountUsdt || 0);
    const purchaseUsdt = parseFloat(config.purchaseUsdt || 0);
    
    // Estimate max orders based on budget
    const maxOrders = purchaseUsdt > 0 ? Math.floor(amountUsdt / purchaseUsdt) : 0;
    const estimatedCoverage = (priceVar * maxOrders).toFixed(2);

    // 3. Financial Requirements
    let canPass = false;
    let requirementMsg = "";

    if (strategy === 'short') {
        const btcNeeded = amountUsdt / currentPrice;
        canPass = (availableBTC >= btcNeeded) || (netAvailableUSDT >= amountUsdt);
        requirementMsg = `Required: ${btcNeeded.toFixed(6)} BTC (or $${amountUsdt} USDT backing)`;
    } else {
        canPass = netAvailableUSDT >= amountUsdt;
        requirementMsg = `Required: $${amountUsdt} USDT`;
    }

    return {
        canPass,
        report: {
            title: `${strategy.toUpperCase()} STRATEGY PREVIEW`,
            coverage: `This setup covers approx. ${estimatedCoverage}% price variation.`,
            liquidity: requirementMsg,
            netAvailable: `Net Balance: $${netAvailableUSDT.toFixed(2)} USDT`,
            disclaimer: "Confirm to allocate these funds and start the cycle."
        }
    };
}

function canExecuteStrategy(strategy, dependencies) {
    const { botState, availableUSDT, availableBTC, currentPrice, log } = dependencies;
    const now = Date.now();
    const logInterval = 5000; // 5 seconds for testing

    // --- 1. CALCULATE COMMITTED FUNDS ---
    // We sum the balance of strategies that are NOT stopped.
    let committedUSDT = 0;
    
    // If Long is running, its balance is "locked"
    if (botState.lstate !== 'STOPPED') {
        committedUSDT += parseFloat(botState.lbalance || 0);
    }
    
    // If AI is running, its balance is "locked"
    if (botState.aistate !== 'STOPPED') {
        committedUSDT += parseFloat(botState.aibalance || 0);
    }

    // --- 2. CALCULATE NET LIQUIDITY ---
    const netAvailableUSDT = availableUSDT - committedUSDT;
    
    // --- 3. STRATEGY VALIDATIONS ---

    // LONG VALIDATION
    if (strategy === 'long') {
        const required = parseFloat(botState.lbalance || 0);
        const hasFunds = netAvailableUSDT >= required;
        
        if (now % logInterval < 1500) {
            log(`[VAL-L] Net USDT: $${netAvailableUSDT.toFixed(2)} | Required: $${required.toFixed(2)} | Status: ${hasFunds}`, hasFunds ? 'info' : 'warning');
        }
        return hasFunds;
    }

    // AI VALIDATION
    if (strategy === 'ai') {
        const required = parseFloat(botState.aibalance || 0);
        const hasFunds = netAvailableUSDT >= required;

        if (now % logInterval < 1500) {
            log(`[VAL-AI] Net USDT: $${netAvailableUSDT.toFixed(2)} | Required: $${required.toFixed(2)} | Status: ${hasFunds}`, hasFunds ? 'info' : 'warning');
        }
        return hasFunds;
    }

    // SHORT VALIDATION (Hybrid: BTC or USDT Backing)
    if (strategy === 'short') {
        const requiredUsdt = parseFloat(botState.sbalance || 0);
        const btcNeeded = requiredUsdt / currentPrice;

        // Check if we have enough BTC OR if we have enough Net USDT to back it
        const hasBtc = availableBTC >= btcNeeded;
        const hasUsdtBacking = netAvailableUSDT >= requiredUsdt;
        const canPass = hasBtc || hasUsdtBacking;

        if (now % logInterval < 1500) {
            log(`[VAL-S] BTC Avail: ${availableBTC.toFixed(6)} | Needed: ${btcNeeded.toFixed(6)} | USDT Backing: ${hasUsdtBacking} | Status: ${canPass}`, canPass ? 'info' : 'warning');
        }
        return canPass;
    }

    return false;
}

module.exports = { canExecuteStrategy, getStartAnalysis };