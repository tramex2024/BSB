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
    const priceVar = parseFloat(config.price_var || 0);
    const amountUsdt = parseFloat(config.amountUsdt || 0);
    const purchaseUsdt = parseFloat(config.purchaseUsdt || 0);
    
    const maxOrders = purchaseUsdt > 0 ? Math.floor(amountUsdt / purchaseUsdt) : 0;
    const estimatedCoverage = (priceVar * maxOrders).toFixed(2);

    // 3. Financial Requirements & Report Generation
    let canPass = false;
    let requirementMsg = "";

    // --- CASE: AI ---
    if (strategy === 'ai') {
        const required = parseFloat(botState.aibalance || 0);
        canPass = netAvailableUSDT >= required;
        requirementMsg = `Dedicated AI Fund: $${required} USDT`;
        
        return {
            canPass,
            report: {
                title: `AI CORE NEURAL START`,
                coverage: `Dynamic Adaptive Coverage (AI Managed).`,
                liquidity: requirementMsg,
                netAvailable: `Net Balance: $${netAvailableUSDT.toFixed(2)} USDT`,
                disclaimer: "Confirm to engage the Neural Core for automated market analysis."
            }
        };
    }

    // --- CASE: SHORT ---
    if (strategy === 'short') {
        const btcNeeded = amountUsdt / currentPrice;
        canPass = (availableBTC >= btcNeeded) || (netAvailableUSDT >= amountUsdt);
        requirementMsg = `Required: ${btcNeeded.toFixed(6)} BTC (or $${amountUsdt} USDT backing)`;
    } 
    // --- CASE: LONG (Ahora explícito) ---
    else if (strategy === 'long') {
        canPass = netAvailableUSDT >= amountUsdt;
        requirementMsg = `Required: $${amountUsdt} USDT`;
    }

    // Return estándar para Long y Short
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
    const logInterval = 5000; 

    let committedUSDT = 0;
    if (botState.lstate !== 'STOPPED') committedUSDT += parseFloat(botState.lbalance || 0);
    if (botState.aistate !== 'STOPPED') committedUSDT += parseFloat(botState.aibalance || 0);

    const netAvailableUSDT = availableUSDT - committedUSDT;
    
    if (strategy === 'long') {
        const required = parseFloat(botState.lbalance || 0);
        const hasFunds = netAvailableUSDT >= required;
        if (now % logInterval < 1500) {
            log(`[VAL-L] Net USDT: $${netAvailableUSDT.toFixed(2)} | Required: $${required.toFixed(2)} | Status: ${hasFunds}`, hasFunds ? 'info' : 'warning');
        }
        return hasFunds;
    }

    if (strategy === 'ai') {
        const required = parseFloat(botState.aibalance || 0);
        const hasFunds = netAvailableUSDT >= required;
        if (now % logInterval < 1500) {
            log(`[VAL-AI] Net USDT: $${netAvailableUSDT.toFixed(2)} | Required: $${required.toFixed(2)} | Status: ${hasFunds}`, hasFunds ? 'info' : 'warning');
        }
        return hasFunds;
    }

    if (strategy === 'short') {
        const requiredUsdt = parseFloat(botState.sbalance || 0);
        const btcNeeded = requiredUsdt / currentPrice;
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