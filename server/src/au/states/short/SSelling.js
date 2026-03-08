/**
 * SELLING STATE (SHORT):
 * Manages short openings and exponential coverages (DCA upwards).
 * FIX: Validates BTC (Base) balance instead of USDT (Quote) for Spot Sell orders.
 */
async function run(dependencies) {
    const {
        userId, 
        botState, currentPrice, config, log,
        updateBotState, updateSStateData, updateGeneralBotState,
        availableUSDT,
        availableBTC, // 🟢 AUDIT: Injected BTC balance for Spot Shorting
        placeShortOrder 
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const SSTATE = 'short';

    try {
        // 1. ACTIVE ORDER MONITOR
        const orderIsActive = await monitorShortSell(
            botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState, userId
        );
        if (orderIsActive) return; 

        // 2. MONITORING LOG (Dashboard)
        if (botState.sppc > 0) {
            const nextPrice = botState.sncp || 0; 
            const targetActivation = botState.stprice || 0; 
            
            const distToDCA = nextPrice > 0 ? ((nextPrice / currentPrice - 1) * 100).toFixed(2) : "0.00";
            const distToTP = targetActivation > 0 ? ((1 - currentPrice / targetActivation) * 100).toFixed(2) : "0.00";
            const pnlActual = botState.sprofit || 0;
            
            log(`[S-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA at: ${nextPrice.toFixed(2)} (+${distToDCA}%) | TP Target: ${targetActivation.toFixed(2)} (-${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }

        // 3. OPENING LOGIC (First cycle order)
        const currentPPC = parseFloat(botState.sppc || 0);
        const pendingOrder = botState.slastOrder; 

        if ((!currentPPC || currentPPC === 0) && !pendingOrder) {
            const purchaseAmountUsdt = parseFloat(config.short?.purchaseUsdt || 0);
            
            // 🟢 AUDIT: Calculate BTC needed to execute the sell order at current price
            const requiredBTC = purchaseAmountUsdt / currentPrice;
            const currentSBalance = parseFloat(botState.sbalance || 0);

            // FIX: Check if we actually have the BTC to sell in Spot
            if (availableBTC >= requiredBTC && currentSBalance >= purchaseAmountUsdt) {
                log(`🚀 [S-SELL] Starting SIGNED Short cycle. Selling ${requiredBTC.toFixed(6)} BTC.`, 'info');
                await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, currentPrice, placeShortOrder);
            } else {
                const reason = availableBTC < requiredBTC ? `Insufficient BTC (${availableBTC.toFixed(6)})` : `Bot limit reached`;
                log(`⚠️ [S-SELL] Cannot open Short: ${reason}`, 'warning');
                await updateBotState('PAUSED', SSTATE);
            }
            return;
        }

        // 4. TAKE PROFIT EVALUATION (Moving to S-BUYING)
        const targetActivation = botState.stprice || 0; 
        if (targetActivation > 0 && currentPrice <= targetActivation) {
            log(`💰 [S-SELL] Target reached (${targetActivation.toFixed(2)}). Moving to BUYING for buyback...`, 'success');
            
            await updateGeneralBotState({
                spm: 0, 
                spc: 0 
            });

            await updateBotState('BUYING', SSTATE);
            return;
        }

        // 5. EXPONENTIAL DCA (If price goes up)
        const requiredAmountUsdt = parseFloat(botState.srca || 0); 
        const nextCoveragePrice = parseFloat(botState.sncp || 0); 

        const isPriceHighEnough = nextCoveragePrice > 0 && currentPrice >= nextCoveragePrice;

        if (!pendingOrder && isPriceHighEnough) {
            // 🟢 AUDIT: Convert DCA USDT amount to BTC quantity
            const requiredBTCCoverage = requiredAmountUsdt / currentPrice;
            
            // FIX: Validate BTC availability for coverage sell
            const hasBalance = availableBTC >= requiredBTCCoverage && botState.sbalance >= requiredAmountUsdt;

            if (hasBalance && requiredAmountUsdt > 0) {
                log(`📈 [S-SELL] Price in DCA zone. Increasing SIGNED coverage...`, 'warning');
                try {
                    await placeCoverageShortOrder(botState, requiredAmountUsdt, log, updateGeneralBotState, updateBotState, currentPrice, placeShortOrder);
                } catch (error) {
                    log(`❌ [S-SELL] Error placing coverage: ${error.message}`, 'error');
                }
            } else {
                log(`🚫 [S-SELL] Short DCA failed: Not enough BTC in wallet to sell.`, 'error');
                await updateBotState('PAUSED', SSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL] Error in SSelling: ${criticalError.message}`, 'error');
    }
}

module.exports = { run };