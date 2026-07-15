const { placeFirstShortOrder, placeCoverageShortOrder } = require('../../managers/shortOrderManager');
const { monitorAndConsolidateShort: monitorShortSell } = require('./ShortSellConsolidator');

/**
 * SELLING STATE (SHORT):
 * Manages Short openings and exponential coverage (DCA upwards).
 */
async function run(dependencies) {
    const {
        userId, 
        botState, currentPrice, config, log,
        updateBotState, updateSStateData, updateGeneralBotState,
        placeShortOrder,
        userCreds 
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const SSTATE = 'short';
    const availableBTC = parseFloat(botState.lastAvailableBTC || 0); // Extraemos BTC disponible

    try {
        // 1. ACTIVE ORDER MONITOR
        const orderIsActive = await monitorShortSell(
            botState, 
            SYMBOL, 
            log, 
            updateSStateData, 
            updateBotState, 
            updateGeneralBotState, 
            userId,
            userCreds
        );        
        
        if (orderIsActive) return; 

        // 2. MONITORING LOG
        if (parseFloat(botState.sppc || 0) > 0) {
            const nextPrice = parseFloat(botState.sncp || 0); 
            const targetActivation = parseFloat(botState.stprice || 0); 
            const distToDCA = nextPrice > 0 ? ((nextPrice / currentPrice - 1) * 100).toFixed(2) : "0.00";
            const distToTP = targetActivation > 0 ? ((1 - currentPrice / targetActivation) * 100).toFixed(2) : "0.00";
            const pnlActual = botState.sprofit || 0;
            log(`[S-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA : ${nextPrice.toFixed(2)} (+${distToDCA}%) | TP Target: ${targetActivation.toFixed(2)} (-${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }

        // 3. OPENING LOGIC
        const currentPPC = parseFloat(botState.sppc || 0);
        const pendingOrder = botState.slastOrder; 

        if (currentPPC === 0 && !pendingOrder) {
            const purchaseAmount = parseFloat(config.short?.purchaseUsdt || 0);
            const btcNeeded = purchaseAmount / currentPrice;

            // VALIDACIÓN POR BTC
            if (availableBTC >= btcNeeded) {
                log(`🚀 [S-SELL] Starting SIGNED Short cycle. (BTC Available: ${availableBTC.toFixed(6)})`, 'info');
                try {
                    await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, currentPrice, placeShortOrder);
                } catch (orderError) {
                    log(`❌ [S-SELL] Failed to place first Short order: ${orderError.message}. Pausing bot.`, 'error');
                    await updateBotState('PAUSED', SSTATE);
                }
            } else {
                log(`⚠️ [S-SELL DEBUG] Insufficient BTC. Available: ${availableBTC.toFixed(6)} | Needed: ${btcNeeded.toFixed(6)}`, 'error');
                await updateBotState('PAUSED', SSTATE);
            }
            return;
        }

        // 4. TAKE PROFIT EVALUATION
        const targetActivation = parseFloat(botState.stprice || 0); 
        if (targetActivation > 0 && currentPrice <= targetActivation) {
            log(`💰 [S-SELL] Target reached (${targetActivation.toFixed(2)}). Moving to BUYING...`, 'success');
            await updateGeneralBotState({ spm: 0, spc: 0 });
            await updateBotState('BUYING', SSTATE);
            return;
        }

        // 5. EXPONENTIAL DCA
        const requiredAmount = parseFloat(botState.srca || 0); 
        const nextCoveragePrice = parseFloat(botState.sncp || 0); 
        const lastExecutionPrice = parseFloat(botState.slep || 0);
        const isPriceHighEnough = nextCoveragePrice > 0 && currentPrice >= nextCoveragePrice;

        if (!pendingOrder && isPriceHighEnough) {
            if (lastExecutionPrice > 0 && currentPrice <= lastExecutionPrice) return; 

            const btcNeeded = requiredAmount / currentPrice;

            // VALIDACIÓN POR BTC
            if (availableBTC >= btcNeeded && requiredAmount > 0) {
                log(`📈 [S-SELL] Price in DCA zone. Increasing SIGNED coverage...`, 'warning');
                try {
                    await placeCoverageShortOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState, currentPrice, placeShortOrder);
                } catch (error) {
                    log(`❌ [S-SELL] Error placing coverage: ${error.message}. Pausing.`, 'error');
                    await updateBotState('PAUSED', SSTATE);
                }
            } else {
                log(`🚫 [S-SELL DEBUG] DCA failed. Insufficient BTC. Available: ${availableBTC.toFixed(6)} | Needed: ${btcNeeded.toFixed(6)}`, 'error');
                await updateBotState('PAUSED', SSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL] Unexpected error in SSelling: ${criticalError.message}`, 'error');
        try { await updateBotState('PAUSED', SSTATE); } catch (dbError) {}
    }
}

module.exports = { run };