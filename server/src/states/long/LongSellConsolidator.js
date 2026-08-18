/**
 * BSB/server/src/states/long/LongSellConsolidator.js
 * SELL CONSOLIDATOR (LONG): Confirms the closure of the Long cycle.
 */

const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService');
const { handleSuccessfulSell } = require('../../managers/longDataManager');
const { logSuccessfulCycle } = require('../../../services/cycleLogService'); 
const { TRADE_SYMBOL } = require('../../../utils/tradeConstants');

/**
 * @param {string} userId - Injected to ensure we query the correct API Key.
 */
async function monitorAndConsolidateLongSell(botState, SYMBOL = TRADE_SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState, userId, userCreds) {
    
    const lastOrder = botState.llastOrder;

    // Safety validation
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);

    // 🟢 AUDIT: Using injected credentials
    const creds = userCreds;

    try {
        // 1. ISOLATED QUERY: Passing creds to use their API KEY
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString, creds);
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);

        // Fallback: If API does not respond with details, search in user's recent history
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL, creds);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // === CASE A: CONFIRMED SELL (Successful Cycle) ===
        if (isFilled) {
            log(`💰 [L-SELL-SUCCESS] Sell confirmed. Processing cycle liquidation...`, 'success');
            
            const handlerDependencies = { 
                log, 
                updateBotState, 
                updateLStateData, 
                updateGeneralBotState, 
                logSuccessfulCycle,
                userId, // Identity for profit persistence in DB
                config: botState.config
            };
            
            // Send to manager to calculate net profit and reset root variables
            await handleSuccessfulSell(botState, finalDetails, handlerDependencies);

            return true;
        }

        // === CASE B: ORDER STILL ACTIVE ===
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            return true; 
        }

        // === CASE C: MANUAL OR ERROR CANCELLATION ===
        if (isCanceled) {
            log(`⚠️ [L-SELL-CANCEL] Sell order canceled on Exchange. Releasing slot for retry.`, 'warning');
            
            // Clear llastOrder so LSelling.js can place the order again if price remains below stop
            await updateGeneralBotState({ llastOrder: null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[L-SELL-ERROR] Monitoring error (User: ${userId}): ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateLongSell };