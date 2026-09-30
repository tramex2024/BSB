/**
 * BSB/server/src/managers/shortOrderManager.js
 * SHORT ORDER MANAGER:
 * Executes sell orders (opening/DCA) and buy orders (closing) with signed execution functions.
 * Soporta API BitMart V2/V4, prevención de órdenes duplicadas, conversión USDT->BTC y cancelación activa.
 */

const { MIN_USDT_VALUE_FOR_BITMART, TRADE_SYMBOL } = require('../../utils/tradeConstants');

/**
 * Helper estandarizado para extraer el ID de la orden sin importar la estructura de respuesta de BitMart.
 */
function extractOrderId(orderResult) {
    if (!orderResult) return null;
    return orderResult.order_id || 
           orderResult.orderId || 
           orderResult.data?.order_id || 
           orderResult.data?.orderId || 
           null;
}

/**
 * Convierte montos USDT a unidades BTC basándose en el precio actual.
 * Aplica truncamiento hacia abajo (floor) a 6 decimales para compatibilidad con BitMart.
 */
function convertUsdtToBtc(usdtAmount, currentPrice) {
    if (!currentPrice || currentPrice <= 0) return 0;
    const btcAmount = usdtAmount / currentPrice;
    return Math.floor(btcAmount * 1000000) / 1000000;
}

/**
 * SHORT OPENING: Sells BTC (Market Sell).
 */
async function placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, injectedPrice = 0, executeOrder) {
    // Manejo polimórfico si se omite el argumento opcional injectedPrice
    if (typeof injectedPrice === 'function') {
        executeOrder = injectedPrice;
        injectedPrice = 0;
    }

    // Protección anti-duplicados: si ya existe una orden pendiente en slastOrder
    if (botState?.slastOrder?.order_id) {
        log(`[S-FIRST] ⚠️ Order already pending (${botState.slastOrder.order_id}). Skipping new attempt.`, 'warning');
        return false;
    }

    const { purchaseUsdt } = config?.short || {};
    const SYMBOL = config?.symbol || TRADE_SYMBOL;
    const amountNominal = parseFloat(purchaseUsdt || 0);
    const currentPrice = parseFloat(injectedPrice || botState?.price || 0);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[S-FIRST] ❌ Error: Amount $${amountNominal} is below the minimum ($${MIN_USDT_VALUE_FOR_BITMART}).`, 'error');
        if (updateBotState) await updateBotState('PAUSED', 'short');
        return false;
    }

    const btcSize = convertUsdtToBtc(amountNominal, currentPrice);

    if (btcSize <= 0 || isNaN(btcSize)) {
        log(`[S-FIRST] ❌ Error: Invalid BTC size calculated (${btcSize}) at price $${currentPrice}.`, 'error');
        return false;
    }

    log(`🚀 [S-FIRST] Sending SIGNED Short opening of ${btcSize} BTC ($${amountNominal.toFixed(2)} USDT)...`, 'info');

    try {
        const orderResult = await executeOrder({
            symbol: SYMBOL,
            side: 'sell',
            type: 'market',
            size: btcSize
        });

        const orderId = extractOrderId(orderResult);

        if (orderId) {
            if (updateGeneralBotState) {
                await updateGeneralBotState({
                    sstartTime: botState?.sstartTime || new Date(),
                    slastOrder: {
                        order_id: String(orderId),
                        side: 'sell',
                        btc_size: btcSize,
                        usdt_amount: amountNominal,
                        timestamp: new Date()
                    }
                });
            }
            log(`✅ [S-FIRST] Short order sent ID: ${orderId}. BTC: ${btcSize}`, 'success');
            return orderId;
        } else {
            log(`⚠️ [S-FIRST] Short order sent but no valid order_id returned: ${JSON.stringify(orderResult)}`, 'warning');
            return false;
        }
    } catch (error) {
        log(`❌ [S-FIRST] API Error in Short opening: ${error.message}`, 'error');
        return false;
    }
}

/**
 * SHORT DCA: Sells more BTC (Average up).
 */
async function placeCoverageShortOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState, injectedPrice = 0, executeOrder) {
    if (typeof injectedPrice === 'function') {
        executeOrder = injectedPrice;
        injectedPrice = 0;
    }

    // Protección anti-duplicados
    if (botState?.slastOrder?.order_id) {
        log(`[S-DCA] ⚠️ Order already pending (${botState.slastOrder.order_id}). Skipping DCA retry.`, 'warning');
        return false;
    }

    const SYMBOL = botState?.config?.symbol || TRADE_SYMBOL;
    const amountNominal = parseFloat(usdtAmount || 0);
    const currentPrice = parseFloat(injectedPrice || botState?.price || 0);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[S-DCA] ❌ Error: Short DCA amount $${amountNominal.toFixed(2)} is below minimum ($${MIN_USDT_VALUE_FOR_BITMART}).`, 'error');
        return false;
    }

    const btcSize = convertUsdtToBtc(amountNominal, currentPrice);

    if (btcSize <= 0 || isNaN(btcSize)) {
        log(`[S-DCA] ❌ Error: Invalid BTC size calculated (${btcSize}) at price $${currentPrice}.`, 'error');
        return false;
    }

    log(`📉 [S-DCA] Executing SIGNED Short coverage: ${btcSize} BTC ($${amountNominal.toFixed(2)} USDT)...`, 'warning');

    try {
        const orderResult = await executeOrder({
            symbol: SYMBOL,
            side: 'sell',
            type: 'market',
            size: btcSize
        });

        const orderId = extractOrderId(orderResult);

        if (orderId) {
            if (updateGeneralBotState) {
                await updateGeneralBotState({
                    slastOrder: {
                        order_id: String(orderId),
                        side: 'sell',
                        btc_size: btcSize,
                        usdt_amount: amountNominal,
                        timestamp: new Date()
                    }
                });
            }
            log(`✅ [S-DCA] Short coverage sent ID: ${orderId}. BTC: ${btcSize}`, 'success');
            return orderId;
        } else {
            log(`⚠️ [S-DCA] Short DCA sent but no valid order_id returned: ${JSON.stringify(orderResult)}`, 'warning');
            return false;
        }
    } catch (error) {
        log(`❌ [S-DCA] Error in Short DCA: ${error.message}`, 'error');
        return false;
    }
}

/**
 * CLOSING REPURCHASE (Take Profit).
 */
async function placeShortBuyOrder(config, botState, btcAmount, log, updateGeneralBotState, injectedPrice = 0, executeOrder) {
    if (typeof injectedPrice === 'function') {
        executeOrder = injectedPrice;
        injectedPrice = 0;
    }

    // Protección anti-duplicados
    if (botState?.slastOrder?.order_id) {
        log(`[S-PROFIT] ⚠️ Order already pending (${botState.slastOrder.order_id}). Skipping redundant buy.`, 'warning');
        return false;
    }

    const SYMBOL = config?.symbol || TRADE_SYMBOL;
    const currentPrice = parseFloat(injectedPrice || botState?.price || 0);
    const qtyToBuy = parseFloat(btcAmount || 0);

    if (qtyToBuy <= 0 || isNaN(qtyToBuy)) {
        log(`[S-PROFIT] ❌ Error: Invalid BTC amount (${btcAmount})`, 'error');
        return false;
    }

    // BitMart Market Buy requiere monto en la moneda de cotización (USDT)
    const usdtNeeded = parseFloat((qtyToBuy * currentPrice).toFixed(4));

    if (usdtNeeded < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[S-PROFIT] ❌ Error: Repurchase amount $${usdtNeeded.toFixed(2)} is below minimum ($${MIN_USDT_VALUE_FOR_BITMART}).`, 'error');
        return false;
    }

    log(`💰 [S-PROFIT] Rebuying to close Short (SIGNED): ${qtyToBuy.toFixed(6)} BTC ($${usdtNeeded.toFixed(2)} USDT)...`, 'info');

    try {
        const orderResult = await executeOrder({
            symbol: SYMBOL,
            side: 'buy',
            type: 'market',
            notional: usdtNeeded
        });

        const orderId = extractOrderId(orderResult);

        if (orderId) {
            if (updateGeneralBotState) {
                await updateGeneralBotState({
                    slastOrder: {
                        order_id: String(orderId),
                        size: qtyToBuy,
                        usdt_amount: usdtNeeded,
                        side: 'buy',
                        timestamp: new Date()
                    }
                });
            }
            log(`✅ [S-PROFIT] Repurchase sent ID: ${orderId}.`, 'success');
            return orderId;
        } else {
            log(`⚠️ [S-PROFIT] Short repurchase sent but no valid order_id returned: ${JSON.stringify(orderResult)}`, 'warning');
            return false;
        }
    } catch (error) {
        log(`❌ [S-PROFIT] Error in Short closing: ${error.message}`, 'error');
        return false;
    }
}

/**
 * CANCELLATION: Cancels active Short order on exchange and resets slastOrder state if confirmed.
 */
async function cancelActiveShortOrder(botState, log, updateGeneralBotState, cancelOrderFn) {
    const lastOrder = botState?.slastOrder;
    if (!lastOrder || !lastOrder.order_id) {
        log(`[S-CANCEL] No active Short order to cancel.`, 'info');
        return true;
    }

    const orderIdString = String(lastOrder.order_id);
    const SYMBOL = botState?.config?.symbol || TRADE_SYMBOL;

    log(`🛑 [S-CANCEL] Requesting cancellation for Short order ID: ${orderIdString}...`, 'warning');

    try {
        if (typeof cancelOrderFn === 'function') {
            await cancelOrderFn({ symbol: SYMBOL, order_id: orderIdString });
        }

        if (updateGeneralBotState) {
            await updateGeneralBotState({ slastOrder: null });
        }
        log(`✅ [S-CANCEL] Short order ${orderIdString} cancellation processed.`, 'success');
        return true;
    } catch (error) {
        log(`❌ [S-CANCEL] Error canceling Short order ${orderIdString}: ${error.message}`, 'error');
        return false;
    }
}

module.exports = {
    placeFirstShortOrder,
    placeCoverageShortOrder,
    placeShortBuyOrder,
    cancelActiveShortOrder
};