// BSB/server/src/states/short/SSelling.js

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
        availableUSDT,
        placeShortOrder,
        userCreds 
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const SSTATE = 'short';

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
        
        // --- THE BLOCK: We only return if there's an actual active order ---
        if (orderIsActive) return; 

        // 2. MONITORING LOG (The "Eye" 👁️)
        if (parseFloat(botState.sppc || 0) > 0) {
            const nextPrice = parseFloat(botState.sncp || 0); 
            const targetActivation = parseFloat(botState.stprice || 0); 
            
            const distToDCA = nextPrice > 0 ? ((nextPrice / currentPrice - 1) * 100).toFixed(2) : "0.00";
            const distToTP = targetActivation > 0 ? ((1 - currentPrice / targetActivation) * 100).toFixed(2) : "0.00";
            const pnlActual = botState.sprofit || 0;
            
            log(`[S-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | DCA : ${nextPrice.toFixed(2)} (+${distToDCA}%) | TP Target: ${targetActivation.toFixed(2)} (-${distToTP}%) | PNL: ${pnlActual.toFixed(2)} USDT`, 'info');
        }

        // 3. OPENING LOGIC (First order of the cycle)
        const currentPPC = parseFloat(botState.sppc || 0);
        const pendingOrder = botState.slastOrder; 

        if (currentPPC === 0 && !pendingOrder) {
            const purchaseAmount = parseFloat(config.short?.purchaseUsdt || 0);
            const currentSBalance = parseFloat(botState.sbalance || 0);

            if (availableUSDT >= purchaseAmount && currentSBalance >= purchaseAmount) {
                log(`🚀 [S-SELL] Starting SIGNED Short cycle.`, 'info');
                // SOLUCIÓN: Envolver en try/catch para manejar caídas del exchange por saldo u otros motivos
                try {
                    await placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, currentPrice, placeShortOrder);
                } catch (orderError) {
                    log(`❌ [S-SELL] Failed to place first Short order: ${orderError.message}. Pausing bot.`, 'error');
                    await updateBotState('PAUSED', SSTATE);
                }
            } else {
                log(`⚠️ [S-SELL] Insufficient funds to open Short position.`, 'warning');
                await updateBotState('PAUSED', SSTATE);
            }
            return;
        }

        // 4. TAKE PROFIT EVALUATION (Move to S-BUYING)
        const targetActivation = parseFloat(botState.stprice || 0); 
        if (targetActivation > 0 && currentPrice <= targetActivation) {
            log(`💰 [S-SELL] Target reached (${targetActivation.toFixed(2)}). Moving to BUYING for repurchase...`, 'success');
            
            await updateGeneralBotState({
                spm: 0, 
                spc: 0 
            });

            await updateBotState('BUYING', SSTATE);
            return;
        }

        // 5. EXPONENTIAL DCA (If price goes up)
        const requiredAmount = parseFloat(botState.srca || 0); 
        const nextCoveragePrice = parseFloat(botState.sncp || 0); 
        const lastExecutionPrice = parseFloat(botState.slep || 0);

        const isPriceHighEnough = nextCoveragePrice > 0 && currentPrice >= nextCoveragePrice;

        if (!pendingOrder && isPriceHighEnough) {
            
            if (lastExecutionPrice > 0 && currentPrice <= lastExecutionPrice) {
                return; 
            }

            const currentSBalance = parseFloat(botState.sbalance || 0);
            const hasBalance = currentSBalance >= requiredAmount && availableUSDT >= requiredAmount;

            if (hasBalance && requiredAmount > 0) {
                log(`📈 [S-SELL] Price in DCA zone. Increasing SIGNED coverage...`, 'warning');
                try {
                    await placeCoverageShortOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState, currentPrice, placeShortOrder);
                } catch (error) {
                    // SOLUCIÓN: Si falla la colocación en el exchange, forzar transición a PAUSED
                    log(`❌ [S-SELL] Error placing coverage on Exchange: ${error.message}. Pausing bot to secure funds.`, 'error');
                    await updateBotState('PAUSED', SSTATE);
                }
            } else {
                log(`🚫 [S-SELL] DCA failed due to insufficient balance. Pausing bot.`, 'error');
                await updateBotState('PAUSED', SSTATE);
            }
            return;
        }

    } catch (criticalError) {
        log(`🔥 [CRITICAL] Unexpected error in SSelling: ${criticalError.message}`, 'error');
        // Salvaguarda: Si algo totalmente imprevisto rompe el flujo, pausamos por seguridad.
        try {
            await updateBotState('PAUSED', SSTATE);
        } catch (dbError) {
            log(`🚨 [CRITICAL] Could not even update state to PAUSED: ${dbError.message}`, 'error');
        }
    }
}

module.exports = { run };