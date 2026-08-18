/**
 * BSB/server/src/states/long/LongBuyConsolidator.js
 * BUY CONSOLIDATOR (LONG):
 * The "watchdog" that waits for BitMart confirmation of order execution.
 */

const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService');
const { handleSuccessfulBuy } = require('../../managers/longDataManager'); 
const { TRADE_SYMBOL } = require('../../utils/tradeConstants');

/**
 * @param {string} userId - Added for multi-user support.
 */
async function monitorAndConsolidate(botState, SYMBOL = TRADE_SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState, userId, userCreds) {    
    
    // 1. Order existence check
    const lastOrder = botState.llastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);

    // 🟢 AUDIT: Using injected credentials instead of botState.config
    const creds = userCreds; 

    try {
        // 2. ISOLATED QUERY PER USER
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString, creds);
        
        // CORRECTION: BitMart V4 uses filled_size for executed volume
        let filledVolume = parseFloat(
            finalDetails?.filled_size ||   // <--- Add this (API V4)
            finalDetails?.filledSize ||    // (API V2/V4 fallback)
            finalDetails?.filled_volume || // (Websocket/History)
            0
        );

        // If order is 'filled' but object lacks normalized 'size', inject it for saveExecutedOrder.
        if (finalDetails && !finalDetails.size && filledVolume > 0) {
            finalDetails.size = filledVolume;
        }
        
        // Same for average price if it comes as price_avg or priceAvg
        if (finalDetails && !finalDetails.priceAvg) {
            finalDetails.priceAvg = finalDetails.price_avg || finalDetails.avg_price || 0;
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // =================================================================
        // CASE 1: SUCCESS (Order filled)
        // =================================================================
        if (isFilled) {
            log(`[CONSOLIDATOR] ✅ Buy confirmed: ${orderIdString}. Updating balances...`, 'success');
            
            const dependencies = { 
                updateGeneralBotState, 
                updateLStateData,
                userId 
            };
            
            await handleSuccessfulBuy(botState, finalDetails, log, dependencies);
            
            return true; 
        } 

        // =================================================================
        // CASE 2: ACTIVE ORDER (Still waiting)
        // =================================================================
        if (finalDetails && ['new', 'partially_filled'].includes(finalDetails.state)) {
            return true; 
        } 

        // =================================================================
        // CASE 3: FAILURE OR CANCELLATION
        // =================================================================
        if (isCanceled && filledVolume === 0) {
            log(`[CONSOLIDATOR] ❌ Order ${orderIdString} canceled. Releasing slot.`, 'error');
            await updateGeneralBotState({ llastOrder: null });
            return false; 
        }

        // If it reaches here and there's no clear 'new' or 'filled' state
        return false; 

    } catch (error) {
        log(`[CONSOLIDATOR] ⚠️ Error in monitoring (User: ${userId}): ${error.message}`, 'warning');
        return false; 
    }
}

module.exports = { monitorAndConsolidate };