/**
 * BSB/server/src/states/short/ShortBuyConsolidator.js
 * SHORT BUY CONSOLIDATOR:
 * Confirms cycle closure when the Take Profit (Buy Market) is executed.
 * 🟢 FIX: Receives 'userCreds' as the last parameter to prevent ReferenceError.
 */

const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService');
const { handleSuccessfulShortBuy } = require('../../managers/shortDataManager');
const { logSuccessfulCycle } = require('../../../services/cycleLogService'); 
const { TRADE_SYMBOL } = require('../../../utils/tradeConstants');

async function monitorAndConsolidateShortBuy(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState, userId, userCreds) {
    const lastOrder = botState.slastOrder;

    // In Short, the cycle closes with a buy order to return the "borrowed" assets
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);

    // 🟢 AUDIT: Assign the received parameter to the constant used in queries
    const creds = userCreds;
    const effectiveSymbol = String(SYMBOL || TRADE_SYMBOL);

    try {
        // Query BitMart using the user's context to access their API Keys
        let finalDetails = await getOrderDetail(effectiveSymbol, orderIdString, creds);
        
        let filledVolume = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.filledVolume || 0
        );

        // Fallback: History check if direct query does not return clear data
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(effectiveSymbol, creds);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
            }
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // === CASE A: SUCCESSFUL BUYBACK (POSITION CLOSURE) ===
        if (isFilled) {
            log(`💰 [S-BUY-SUCCESS] Buyback confirmed. Liquidating cycle and calculating profit...`, 'success');
            
            const handlerDependencies = { 
                userId, // Injected identity for cycle history and balance
                log, 
                updateBotState, 
                updateSStateData, 
                updateGeneralBotState, 
                logSuccessfulCycle, 
                config: botState.config 
            };
            
            // The manager handles saveExecutedOrder and resets CLEAN_SHORT_ROOT
            await handleSuccessfulShortBuy(botState, finalDetails, handlerDependencies);
            return true;
        }

        // === CASE B: ORDER STILL IN THE BOOK (Waiting logic) ===
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            return true; 
        }

        // === CASE C: CANCELLATION OR EXECUTION FAILURE ===
        if (isCanceled) {
            log(`⚠️ [S-BUY-CANCEL] Buyback order canceled. Freezing slot for immediate retry.`, 'warning');
            
            // Clear the pending order so SBuying.js can retry the purchase
            await updateGeneralBotState({ 'slastOrder': null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[S-BUY-ERROR] Monitoring error (User: ${userId}): ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShortBuy };