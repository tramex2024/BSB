/**
 * BSB/server/src/states/short/SPaused.js
 * Wait management when capital is insufficient for the next DCA.
 * Fixed: Coverage synchronization with real market price (2026).
 * Updated: Resumption now validates against available BTC (Short Strategy).
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
    
    // Global wrapper to prevent freezing due to calculation errors
    try {
        if (!currentPrice || currentPrice <= 0) return;

        const availableBTC = parseFloat(botState.lastAvailableBTC || 0);
        const currentSBalance = parseFloat(botState.sbalance || 0); // Mantemos para referencia interna si es necesario

        const ac = parseFloat(botState.sac || 0);  // Coins sold (Short position open)
        const ppc = parseFloat(botState.sppc || 0); // Average selling price
        const orderCountInCycle = parseInt(botState.socc || 0);
        
        // Prioritize Trailing repurchase (PC) stop if it exists
        const targetPrice = parseFloat(botState.spc || botState.stprice || 0);

        // --- 1. RECOVERY LOGIC (EXIT TO BUYING) ---
        if (ac > 0 && targetPrice > 0 && currentPrice <= targetPrice) {
            log(`🚀 [S-RECOVERY] Price in profit zone (${currentPrice.toFixed(2)}). Checking BTC liquidity...`, 'success');
            await updateBotState('BUYING', 'short'); 
            return;
        }

        // --- 2. RECALCULATE REQUIREMENTS AND PROJECTION ---
        const recalculation = calculateShortTargets(
            ppc || currentPrice,
            config.short, 
            orderCountInCycle
        );

        const requiredAmountUSDT = parseFloat(recalculation.requiredCoverageAmount || 0);

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
            srca: requiredAmountUSDT, 
            sncp: recalculation.nextCoveragePrice,
            scoverage: coverageInfo.coveragePrice,
            snorder: coverageInfo.numberOfOrders
        });

        // --- 3. RESET INDICATORS (If no position and no funds) ---
        // Se mantiene lógica de reseteo si el saldo es irrisorio
        if (ac <= 0 && availableBTC < (initialPurchaseAmount / currentPrice)) {
            if (parseFloat(botState.scoverage || 0) !== 0) {
                log(`[S-RESET] Insufficient funds for new Short opening. Clearing visual projection.`, 'warning');
                await updateGeneralBotState({ scoverage: 0, snorder: 0 }); 
            }
            // No hacemos return aquí para permitir que la lógica de reintento continúe
        }

        // --- 4. RESUMPTION VERIFICATION (BTC FOCUS SOLUTION) ---
        const amountNeededToResume = ac === 0 ? initialPurchaseAmount : requiredAmountUSDT;
        const btcNeeded = amountNeededToResume / currentPrice;

        // PRIORIDAD: ¿Tengo el BTC suficiente para cubrir esta orden?
        const canResume = availableBTC >= btcNeeded && btcNeeded > 0;

        if (canResume) {
            log(`✅ [S-FUNDS] BTC liquidity sufficient (Available: ${availableBTC.toFixed(6)} BTC | Needed: ${btcNeeded.toFixed(6)} BTC). Resuming in SELLING...`, 'success');
            await updateBotState('SELLING', 'short');
        } else {
            const missingBTC = (btcNeeded - availableBTC).toFixed(6);
            log(`[S-PAUSED] 👁️ Waiting for funds. Available: ${availableBTC.toFixed(6)} BTC | Required: ${btcNeeded.toFixed(6)} BTC (Missing: ${missingBTC} BTC)`, 'debug');
        }
        
    } catch (criticalError) {
        log(`🔥 [CRITICAL] Unexpected error within SPaused state: ${criticalError.message}`, 'error');
    }
} 

module.exports = { run };