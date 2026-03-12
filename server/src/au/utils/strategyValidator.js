/**
 * STRATEGY VALIDATOR (Security Middleware)
 * Determines if a strategy has enough capital in the DB to operate.
 * This prevents API errors (400) by checking balance before execution.
 */

function canExecuteStrategy(strategy, dependencies) {
    const { botState, config, availableUSDT, availableBTC, log, currentPrice } = dependencies;
    const now = Date.now();

    // --- 1. AI STRATEGY CASE ---
    if (strategy === 'ai') {
        const aiConfig = config?.ai;
        if (!aiConfig || !aiConfig.enabled) return false;

        const aiRequired = parseFloat(aiConfig.amountUsdt || 0);
        const hasAIPosition = parseFloat(botState.aiposition || 0) > 0;

        // If a position is already open, ALWAYS allow execution to manage Sell/Exit.
        if (hasAIPosition) return true;

        // Validation for new opening
        if (availableUSDT < aiRequired) {
            if (now % 60000 < 2000) { // Log approx every 60 seconds
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

        const ac = parseFloat(botState.sac || 0); // Accumulated BTC debt
        const isOpening = ac <= 0;

        if (isOpening) {
            const firstSellUsdt = parseFloat(shortConfig.purchaseUsdt || 5.0);
            const btcNeeded = firstSellUsdt / currentPrice;

            if (availableBTC < btcNeeded) {
                if (now % 60000 < 2000) {
                    log(`[S-VAL] Waiting for BTC balance (${availableBTC.toFixed(6)} / ${btcNeeded.toFixed(6)})`, 'warning');
                }
                return false;
            }
        }
        // If debt exists (ac > 0), allow execution to manage DCA or Buyback.
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
            if (now % 60000 < 2000) {
                log(`[L-VAL] Waiting for USDT balance ($${availableUSDT.toFixed(2)} / $${longRequired.toFixed(2)})`, 'warning');
            }
            return false;
        }
        return true;
    }

    return false;
}

module.exports = { canExecuteStrategy };