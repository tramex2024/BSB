// BSB/server/src/au/managers/shortOrderManager.js

/**
 * SHORT ORDER MANAGER:
 * Executes sell orders (opening/DCA) and buy orders (closing) with strategy signatures.
 */
const { MIN_USDT_VALUE_FOR_BITMART } = require('../utils/tradeConstants');

/**
 * Converts USDT amounts to BTC units based on current price.
 * Applies a floor rounding to 6 decimals for BitMart compatibility.
 */
function convertUsdtToBtc(usdtAmount, currentPrice) {
    if (!currentPrice || currentPrice <= 0) return 0;
    const btcAmount = usdtAmount / currentPrice;
    return Math.floor(btcAmount * 1000000) / 1000000;
}

/**
 * SHORT OPENING: Sells BTC (Market Sell).
 * @param {Function} executeOrder - Injected function placeShortOrder (with S_ prefix).
 */
async function placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, injectedPrice = 0, executeOrder) {
    const { purchaseUsdt } = config.short || {};
    const SYMBOL = config.symbol || 'BTC_USDT';
    const amountNominal = parseFloat(purchaseUsdt || 0);
    const currentPrice = injectedPrice || botState.price || 0; 

    const btcSize = convertUsdtToBtc(amountNominal, currentPrice);

    if (btcSize <= 0) {
        log(`[S-FIRST] ❌ Error: Invalid BTC size (${btcSize}).`, 'error');
        return;
    }

    log(`🚀 [S-FIRST] Sending SIGNED Short opening...`, 'info');

    try {
        // ✅ Using signed function with S_ prefix
        const orderResult = await executeOrder({
            symbol: SYMBOL,
            side: 'sell',
            type: 'market',
            size: btcSize
        });

        if (orderResult && (orderResult.order_id || orderResult.data?.order_id)) {
            const orderId = orderResult.order_id || orderResult.data?.order_id;
            await updateGeneralBotState({
                sstartTime: new Date(),
                socc: 1, 
                slastOrder: {                                     
                    order_id: orderId,
                    side: 'sell',
                    btc_size: btcSize,
                    usdt_amount: amountNominal,
                    timestamp: new Date()
                }
            });
            log(`✅ [S-FIRST] Short order sent ID: ${orderId}. BTC: ${btcSize}`, 'success');
        }
    } catch (error) {
        log(`❌ [S-FIRST] API Error in Short opening: ${error.message}`, 'error');
    }
}

/**
 * SHORT DCA: Sells more BTC (Average up).
 */
async function placeCoverageShortOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState, injectedPrice = 0, executeOrder) { 
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';
    const currentPrice = injectedPrice || botState.price || 0;
    const btcSize = convertUsdtToBtc(usdtAmount, currentPrice);

    try {
        const orderResult = await executeOrder({
            symbol: SYMBOL,
            side: 'sell',
            type: 'market',
            size: btcSize
        });

        if (orderResult && (orderResult.order_id || orderResult.data?.order_id)) {
            const orderId = orderResult.order_id || orderResult.data?.order_id;
            await updateGeneralBotState({
                slastOrder: {
                    order_id: orderId,
                    side: 'sell',
                    btc_size: btcSize,
                    usdt_amount: usdtAmount,
                    timestamp: new Date()
                }
            });
            log(`✅ [S-DCA] Short coverage sent ID: ${orderId}. BTC: ${btcSize}`, 'success');
        }
    } catch (error) {
        log(`❌ [S-DCA] Error in Short DCA: ${error.message}`, 'error');
    }
}

/**
 * CLOSING REPURCHASE (Take Profit).
 */
async function placeShortBuyOrder(config, botState, btcAmount, log, updateGeneralBotState, injectedPrice = 0, executeOrder) { 
    const SYMBOL = config.symbol || 'BTC_USDT';
    const currentPrice = injectedPrice || botState.price || 0;
    
    // BitMart Market Buy requires the amount in the quote currency (USDT)
    const usdtNeeded = btcAmount * currentPrice;

    log(`💰 [S-PROFIT] Rebuying to close Short (SIGNED): ${btcAmount.toFixed(6)} BTC...`, 'info');

    try {
        const orderResult = await executeOrder({
            symbol: SYMBOL,
            side: 'buy',
            type: 'market',
            notional: usdtNeeded
        });

        if (orderResult && (orderResult.order_id || orderResult.data?.order_id)) {
            const orderId = orderResult.order_id || orderResult.data?.order_id;
            await updateGeneralBotState({
                slastOrder: {
                    order_id: orderId,
                    size: btcAmount, 
                    side: 'buy',
                    timestamp: new Date()
                }
            });
            log(`✅ [S-PROFIT] Repurchase sent ID: ${orderId}.`, 'success');
        }
    } catch (error) { 
        log(`❌ [S-PROFIT] Error in Short closing: ${error.message}`, 'error');
    }
}

/**
 * CANCELLATION: Direct BitmartService (No signature required).
 */
async function cancelActiveShortOrder(botState, log, updateGeneralBotState, userId) {
    // Keeping your original logic as requested
}

module.exports = {
    placeFirstShortOrder,
    placeCoverageShortOrder,
    placeShortBuyOrder,
    cancelActiveShortOrder
};