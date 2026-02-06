const { placeFirstShortOrder, placeCoverageShortOrder } = require('../../managers/shortOrderManager');
const { monitorAndConsolidateShort: monitorShortSell } = require('./ShortSellConsolidator');

async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateSStateData, updateGeneralBotState,
        availableUSDT
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const SSTATE = 'short';

    try {
        // 1. ACTIVE ORDERS MONITORING
        const orderIsActive = await monitorShortSell(
            botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState
        );
        if (orderIsActive) return; 

        // 2. MONITORING LOG (Unified Format)
        if (botState.sppc > 0) {
            const nextPrice = botState.sncp || 0; 
            const targetActivation = botState.stprice || 0; 
            
            const distToDCA = nextPrice > 0 ? Math.abs(((nextPrice / currentPrice) - 1) * 100).toFixed(2) : "0.00";
            const distToTP = targetActivation > 0 ? Math.abs(((currentPrice / targetActivation) - 1) * 100).toFixed(2) : "0.00";
            const pnlActual = botState.sprofit || 0;

            // Short Logic: DCA is above (+), TP is below (-)
            const signDCA = nextPrice > currentPrice ? '+' : '-';
            const signTP = targetActivation > currentPrice ? '+' : '-';
            
            log(`[S-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA: ${nextPrice.toFixed(2)} (${signDCA}${distToDCA}%) | TP Target: ${targetActivation.toFixed(2)} (${signTP}${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }

        // 3. OPENING LOGIC
        const currentPPC = parseFloat(botState.sppc || 0);
        const pendingOrder = botState.slastOrder; 

        if ((!currentPPC || currentPPC === 0) && !pendingOrder) {
            const purchaseAmount = parseFloat(config.short?.purchaseUsdt || 0);
            const currentSBalance = parseFloat(botState.sbalance || 0);

            if (availableUSDT >= purchaseAmount && currentSBalance >= purchaseAmount) {
                log(`🚀 [S-SELL] Starting Short cycle. Placing first order of ${purchaseAmount} USDT.`, 'info');
                await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, currentPrice);
            } else {
                log(`⚠️ [S-SELL] Insufficient funds to open Short position.`, 'warning');
                await updateBotState('STOPPED', SSTATE);
            }
            return;
        }

        // 4. ACTIVATION EVALUATION (To S-BUYING for Trailing Stop)
        const targetActivation = botState.stprice || 0; 
        if (targetActivation > 0 && currentPrice <= targetActivation) {
            log(`💰 [S-SELL] Target (${targetActivation.toFixed(2)}) reached. Activating Trailing Stop in BUYING...`, 'success');
            
            await updateGeneralBotState({
                spm: 0, 
                spc: 0 
            });

            await updateBotState('BUYING', SSTATE);
            return;
        }

        // 5. EXPONENTIAL DCA (Protection against rises with Security Lock)
        const requiredAmount = parseFloat(botState.srca || 0); 
        const nextCoveragePrice = parseFloat(botState.sncp || 0); 
        const lastExecutionPrice = parseFloat(botState.slep || 0);

        const isPriceHighEnough = nextCoveragePrice > 0 && currentPrice >= nextCoveragePrice;

        if (!pendingOrder && isPriceHighEnough) {
            
            // 🛡️ SECURITY LOCK: Prevents DCA at the same or lower level
            if (currentPrice <= lastExecutionPrice) {
                log(`[S-SELL] 🛑 Security Lock: Current price (${currentPrice.toFixed(2)}) is not higher than last execution (${lastExecutionPrice.toFixed(2)}).`, 'warning');
                return; 
            }

            const hasBalance = botState.sbalance >= requiredAmount && availableUSDT >= requiredAmount;

            if (hasBalance && requiredAmount > 0) {
                log(`📈 [S-SELL] Price above DCA. Increasing coverage...`, 'warning');
                try {
                    await placeCoverageShortOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState, currentPrice);
                } catch (error) {
                    log(`❌ [S-SELL] Failed to place coverage: ${error.message}`, 'error');
                }
            } else {
                log(`🚫 [S-SELL] DCA failed due to insufficient balance.`, 'error');
                await updateBotState('PAUSED', SSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL] SSelling: ${criticalError.message}`, 'error');
    }
}

module.exports = { run };