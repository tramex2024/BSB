/**
 * STRATEGY VALIDATOR - PRE-START ENGINE (Test Mode)
 * Logic: Checks if Available Funds >= Strategy Assigned Balance
 */

function canExecuteStrategy(strategy, dependencies) {
    const { botState, availableUSDT, availableBTC } = dependencies;
    const now = Date.now();
    const logInterval = 5000; // 5 seconds for visual testing

    // --- 1. LONG STRATEGY ---
    const longTarget = parseFloat(botState.lbalance || 0);
    const longPass = availableUSDT >= longTarget && longTarget > 0;

    // --- 2. SHORT STRATEGY ---
    // Note: Short needs BTC to sell. Target is in USDT, so we convert to BTC for comparison.
    const shortTargetUsdt = parseFloat(botState.sbalance || 0);
    const btcNeeded = shortTargetUsdt / (dependencies.currentPrice || 1);
    const shortPass = availableBTC >= btcNeeded && shortTargetUsdt > 0;

    // --- 3. AI STRATEGY ---
    const aiTarget = parseFloat(botState.aibalance || 0);
    const aiPass = availableUSDT >= aiTarget && aiTarget > 0;

    // --- PROVISIONAL TEST LOOP (Independiente del botón) ---
    if (now % logInterval < 1000) {
        if (strategy === 'long') {
            dependencies.log(`[TEST-L] Long ${longPass}: ($${availableUSDT.toFixed(2)} / $${longTarget.toFixed(2)})`, longPass ? 'info' : 'warning');
        }
        if (strategy === 'short') {
            dependencies.log(`[TEST-S] Short ${shortPass}: (${availableBTC.toFixed(6)} / ${btcNeeded.toFixed(6)} BTC)`, shortPass ? 'info' : 'warning');
        }
        if (strategy === 'ai') {
            dependencies.log(`[TEST-AI] AI ${aiPass}: ($${availableUSDT.toFixed(2)} / $${aiTarget.toFixed(2)})`, aiPass ? 'info' : 'warning');
        }
    }

    // Por ahora retornamos true para no bloquear el bot real mientras probamos logs
    return true; 
}

module.exports = { canExecuteStrategy };