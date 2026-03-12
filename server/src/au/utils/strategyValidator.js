/**
 * STRATEGY VALIDATOR (Security Middleware)
 * Determines if a strategy has enough capital in the DB to operate.
 */

function canExecuteStrategy(strategy, dependencies) {
    const { botState, config, availableUSDT, availableBTC, log, currentPrice } = dependencies;
    const now = Date.now();
    const logInterval = 60000; // 1 minute in milliseconds

    // --- 1. AI STRATEGY CASE ---
    if (strategy === 'ai') {
        const aiConfig = config?.ai;
        if (!aiConfig || !aiConfig.enabled) return false;

        const aiRequired = parseFloat(aiConfig.amountUsdt || 0);
        const hasAIPosition = parseFloat(botState.aiposition || 0) > 0;

        if (hasAIPosition) return true;

        if (availableUSDT < aiRequired) {
            // Log every 5 minutes
            if (now % logInterval < 2000) { 
                log(`[AI-VAL] Waiting for USDT balance ($${availableUSDT.toFixed(2)} / $${aiRequired.toFixed(2)})`, 'warning');
            }
            return false;
        }
        return true;
    }

    // --- 2. SHORT STRATEGY CASE ---
    if (strategy === 'short') {
        const shortConfig = config?.short;
        if (!shortConfig || !shortConfig.enabled) return false;

        const ac = parseFloat(botState.sac || 0); 
        const isOpening = ac <= 0;

        if (isOpening) {
            const firstSellUsdt = parseFloat(shortConfig.purchaseUsdt || 5.0);
            const btcNeeded = firstSellUsdt / currentPrice;

            if (availableBTC < btcNeeded) {
                // Log every 5 minutes
                if (now % logInterval < 2000) {
                    log(`[S-VAL] Waiting for BTC balance (${availableBTC.toFixed(6)} / ${btcNeeded.toFixed(6)}) to open Short`, 'warning');
                }
                return false;
            }
        }
        return true;
    }

    // --- 3. LONG STRATEGY CASE ---
    if (strategy === 'long') {
        const longConfig = config?.long;
        if (!longConfig || !longConfig.enabled) return false;

        const hasLongPosition = parseFloat(botState.lac || 0) > 0;
        if (hasLongPosition) return true;

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