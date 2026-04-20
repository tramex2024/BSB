// BSB/server/src/au/managers/longOrderManager.js

/**
 * LONG ORDER MANAGER:
 * Responsible for triggering executions to BitMart using signed functions.
 */
const { MIN_USDT_VALUE_FOR_BITMART } = require('../utils/tradeConstants');

/**
 * LONG OPENING: Initial buy (Market Buy).
 * @param {Function} executeOrder - Injected placeLongOrder function that already includes signature and prefix.
 */
async function placeFirstLongOrder(config, botState, log, updateBotState, updateGeneralBotState, executeOrder) {
    const { purchaseUsdt } = config.long || {}; 
    const SYMBOL = config.symbol || 'BTC_USDT';
    const amountNominal = parseFloat(purchaseUsdt || 0);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[L-FIRST] ❌ Error: Amount $${amountNominal} is below the minimum ($${MIN_USDT_VALUE_FOR_BITMART}).`, 'error');
        await updateBotState('PAUSED', 'long');
        return;
    }

    log(`🚀 [L-FIRST] Sending SIGNED initial purchase of ${amountNominal} USDT...`, 'info');

    try {
        // ✅ We use the injected function so it originates with the L_ prefix
        // Depending on how placeLongOrder is defined, we pass the parameter object.
        const orderResult = await executeOrder({ 
            symbol: SYMBOL, 
            side: 'buy', 
            type: 'market', 
            notional: amountNominal 
        });

        if (orderResult && (orderResult.order_id || orderResult.data?.order_id)) {
            const orderId = orderResult.order_id || orderResult.data?.order_id;
            await updateGeneralBotState({
                llastOrder: {
                    order_id: orderId,
                    side: 'buy',
                    usdt_amount: amountNominal,
                    timestamp: new Date()
                }
            });
            log(`✅ [L-FIRST] Order sent ID: ${orderId}.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-FIRST] API Error during opening: ${error.message}.`, 'error');
    }
}

/**
 * LONG COVERAGE (DCA).
 */
async function placeCoverageBuyOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState, executeOrder) {
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';

    log(`📉 [L-DCA] Executing SIGNED coverage: ${usdtAmount.toFixed(2)} USDT...`, 'warning');

    try {
        const orderResult = await executeOrder({ 
            symbol: SYMBOL, 
            side: 'buy', 
            type: 'market', 
            notional: usdtAmount 
        });

        if (orderResult && (orderResult.order_id || orderResult.data?.order_id)) {
            const orderId = orderResult.order_id || orderResult.data?.order_id;
            await updateGeneralBotState({
                llastOrder: {
                    order_id: orderId,
                    side: 'buy',
                    usdt_amount: usdtAmount,
                    timestamp: new Date()
                }
            });
            log(`✅ [L-DCA] Coverage sent ID: ${orderId}.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-DCA] Error in coverage execution: ${error.message}`, 'error');
    }
}

/**
 * CLOSING SALE (Take Profit).
 */
async function placeLongSellOrder(config, botState, btcAmount, log, updateGeneralBotState, executeOrder) {
    const SYMBOL = config.symbol || 'BTC_USDT';
    
    if (btcAmount <= 0) {
        log(`[L-PROFIT] ❌ Error: Invalid BTC amount (${btcAmount})`, 'error');
        return;
    }

    log(`💰 [L-PROFIT] Sending SIGNED closing sale: ${btcAmount.toFixed(8)} BTC...`, 'info');

    try {
        const orderResult = await executeOrder({ 
            symbol: SYMBOL, 
            side: 'sell', 
            type: 'market', 
            size: btcAmount 
        });

        if (orderResult && (orderResult.order_id || orderResult.data?.order_id)) {
            const orderId = orderResult.order_id || orderResult.data?.order_id;
            await updateGeneralBotState({
                llastOrder: {
                    order_id: orderId,
                    size: btcAmount,
                    side: 'sell',
                    timestamp: new Date()
                }
            });
            log(`✅ [L-PROFIT] Sale sent ID: ${orderId}.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-PROFIT] Error in sell order: ${error.message}`, 'error');
    }
}

/**
 * CANCELLATION: This remains with direct bitmartService as it doesn't require a prefix.
 */
async function cancelActiveLongOrder(botState, log, updateGeneralBotState, userId) {
    // Note: bitmartService would need to be imported here if used directly,
    // or an injected function passed to maintain multi-user consistency.
}

module.exports = {
    placeFirstLongOrder,
    placeCoverageBuyOrder,
    placeLongSellOrder,
    cancelActiveLongOrder
};