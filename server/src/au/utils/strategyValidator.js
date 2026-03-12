/**
 * STRATEGY VALIDATOR (Pure Mathematical Validation)
 * Checks if the wallet balance in DB covers the configured trade amount.
 * Agnostic to strategy state (ac, positions, etc.)
 */

function canExecuteStrategy(strategy, dependencies) {
    const { config, availableUSDT, availableBTC, log, currentPrice } = dependencies;
    const now = Date.now();
    const logInterval = 5000; // 5 seconds for testing purposes

    // --- 1. AI STRATEGY ---
    if (strategy === 'ai') {
        const aiConfig = config?.ai;
        if (!aiConfig || !aiConfig.enabled) return false;

        const aiRequired = parseFloat(aiConfig.amountUsdt || 0);
        
        if (availableUSDT < aiRequired) {
            if (now % logInterval < 2000) {
                log(`[AI-VAL] Waiting for USDT balance ($${availableUSDT.toFixed(2)} / $${aiRequired.toFixed(2)})`, 'warning');
            }
            return false;
        }
        return true;
    }

    // --- 2. SHORT STRATEGY ---
    if (strategy === 'short') {
        const shortConfig = config?.short;
        if (!shortConfig || !shortConfig.enabled) return false;

        // Strictly compare wallet vs configured purchase amount
        const amountToTradeUsdt = parseFloat(shortConfig.purchaseUsdt || 5.0);
        const btcNeeded = amountToTradeUsdt / currentPrice;

        if (availableBTC < btcNeeded) {
            if (now % logInterval < 2000) {
                log(`[S-VAL] Waiting for BTC balance (${availableBTC.toFixed(6)} / ${btcNeeded.toFixed(6)})`, 'warning');
            }
            return false;
        }
        return true;
    }

    // --- 3. LONG STRATEGY ---
    if (strategy === 'long') {
        const longConfig = config?.long;
        if (!longConfig || !longConfig.enabled) return false;

        const longRequired = parseFloat(longConfig.purchaseUsdt || 5.0);
        
        if (availableUSDT < longRequired) {
            if (now % logInterval < 2000) {
                log(`[L-VAL] Waiting for USDT balance ($${availableUSDT.toFixed(2)} / $${longRequired.toFixed(2)})`, 'warning');
            }
            return false;
        }
        return true;
    }

    return false;
}

module.exports = { canExecuteStrategy };