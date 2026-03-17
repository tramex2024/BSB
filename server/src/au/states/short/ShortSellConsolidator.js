// BSB/server/src/au/states/short/ShortSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortSell } = require('../../managers/shortDataManager'); 

/**
 * SHORT SELL CONSOLIDATOR:
 * Monitors SELL orders (Opening or Short DCA).
 * Ensures sold assets are correctly registered in the user's 'sac'.
 */
async function monitorAndConsolidateShort(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState, userId, userCreds) {
    
    const lastOrder = botState.slastOrder;

    // If there's no order to track, or it's not a sell order, we release the lock (false)
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);
    const creds = userCreds; 

    try {
        // Consult BitMart using the specific user's context
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString, creds);
        
        let filledSize = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.size || 0
        );

        // 1. Back-up: If direct query is ambiguous, check user's recent history
        if (!finalDetails || (isNaN(filledSize) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL, creds);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) {
                filledSize = parseFloat(finalDetails.filledSize || finalDetails.size || 0);
            }
        }

        const isFilled = finalDetails?.state === 'filled' || finalDetails?.state === 'completed' || filledSize > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // --- CASE 1: CONFIRMED SELL (Short Opening or DCA) ---
        if (isFilled) {
            const currentOrderCount = (botState.socc || 0) + 1;
            log(`[S-CONSOLIDATOR] ✅ Sell confirmed (#${currentOrderCount}). Updating Short position...`, 'success');
            
            // Immediate slot cleanup to prevent consolidation loops
            await updateGeneralBotState({ slastOrder: null });

            await handleSuccessfulShortSell(botState, { ...finalDetails, filledSize: filledSize || lastOrder.btc_size }, log, { 
                updateGeneralBotState, 
                updateSStateData,
                userId 
            }); 
            
            return false; // Lock released: order processed
        }

        // --- CASE 2: ORDER IN BOOK (Waiting for execution) ---
        // We keep returning TRUE to block new orders while this one is pending
        if (finalDetails && ['new', 'partially_filled', '8'].includes(String(finalDetails.state))) {
            return true; 
        } 

        // --- CASE 3: CANCELED OR FAILED ORDER ---
        if (isCanceled) {
            log(`[S-CONSOLIDATOR] ❌ Short order ${orderIdString} canceled. Releasing for retry.`, 'error');
            await updateGeneralBotState({ slastOrder: null });
            return false; // Lock released: order no longer exists
        }

        // If it reaches here and it's not a known state, we assume it's safer to block (true) 
        // until the next cycle confirms the status.
        return true;

    } catch (error) {
        log(`[S-CONSOLIDATOR] ⚠️ Critical monitoring error: ${error.message}`, 'error');
        // We return TRUE to maintain the lock and prevent placing duplicate orders during API downtime
        return true; 
    }
}

module.exports = { monitorAndConsolidateShort };