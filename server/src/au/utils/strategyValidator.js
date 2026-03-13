/**
 * STRATEGY VALIDATOR - BUDGET & LIQUIDITY ENGINE
 * Logic: Calculates "Net Available" by subtracting committed funds 
 * from active strategies to prevent over-allocation.
 */

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

module.exports = { canExecuteStrategy };