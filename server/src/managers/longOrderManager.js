/**
 * BSB/server/src/au/managers/longOrderManager.js
 * LONG ORDER MANAGER:
 * Responsible for triggering executions to BitMart using signed functions.
 * Soporta API BitMart V2/V4, prevención de órdenes duplicadas y gestión de cancelación.
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
 * LONG OPENING: Initial buy (Market Buy).
 * @param {Object} config
 * @param {Object} botState
 * @param {Function} log
 * @param {Function} updateBotState
 * @param {Function} updateGeneralBotState
 * @param {Function} executeOrder - Injected placeLongOrder function that already includes signature and prefix.
 */
async function placeFirstLongOrder(config, botState, log, updateBotState, updateGeneralBotState, executeOrder) {
    // Protección anti-duplicados: si ya existe una orden pendiente en llastOrder
    if (botState?.llastOrder?.order_id) {
        log(`[L-FIRST] ⚠️ Order already pending (${botState.llastOrder.order_id}). Skipping new attempt.`, 'warning');
        return false;
    }

    const { purchaseUsdt } = config?.long || {}; 
    const SYMBOL = config?.symbol || TRADE_SYMBOL;
    const amountNominal = parseFloat(purchaseUsdt || 0);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[L-FIRST] ❌ Error: Amount $${amountNominal} is below the minimum ($${MIN_USDT_VALUE_FOR_BITMART}).`, 'error');
        if (updateBotState) await updateBotState('PAUSED', 'long');
        return false;
    }

    log(`🚀 [L-FIRST] Sending SIGNED initial purchase of ${amountNominal.toFixed(2)} USDT...`, 'info');

    try {
        const orderResult = await executeOrder({ 
            symbol: SYMBOL, 
            side: 'buy', 
            type: 'market', 
            notional: amountNominal 
        });

        const orderId = extractOrderId(orderResult);

        if (orderId) {
            if (updateGeneralBotState) {
                await updateGeneralBotState({
                    llastOrder: {
                        order_id: String(orderId),
                        side: 'buy',
                        usdt_amount: amountNominal,
                        timestamp: new Date()
                    }
                });
            }
            log(`✅ [L-FIRST] Order sent ID: ${orderId}.`, 'success');
            return orderId;
        } else {
            log(`⚠️️ [L-FIRST] Order executed but no valid order_id returned: ${JSON.stringify(orderResult)}`, 'warning');
            return false;
        }
    } catch (error) {
        log(`❌ [L-FIRST] API Error during opening: ${error.message}.`, 'error');
        return false;
    }
}

/**
 * LONG COVERAGE (DCA).
 */
async function placeCoverageBuyOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState, executeOrder) {
    // Protección anti-duplicados
    if (botState?.llastOrder?.order_id) {
        log(`[L-DCA] ⚠️ Order already pending (${botState.llastOrder.order_id}). Skipping DCA retry.`, 'warning');
        return false;
    }

    const SYMBOL = botState?.config?.symbol || TRADE_SYMBOL;
    const amountNominal = parseFloat(usdtAmount || 0);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[L-DCA] ❌ Error: DCA amount $${amountNominal.toFixed(2)} is below minimum ($${MIN_USDT_VALUE_FOR_BITMART}).`, 'error');
        return false;
    }

    log(`📉 [L-DCA] Executing SIGNED coverage: ${amountNominal.toFixed(2)} USDT...`, 'warning');

    try {
        const orderResult = await executeOrder({ 
            symbol: SYMBOL, 
            side: 'buy', 
            type: 'market', 
            notional: amountNominal 
        });

        const orderId = extractOrderId(orderResult);

        if (orderId) {
            if (updateGeneralBotState) {
                await updateGeneralBotState({
                    llastOrder: {
                        order_id: String(orderId),
                        side: 'buy',
                        usdt_amount: amountNominal,
                        timestamp: new Date()
                    }
                });
            }
            log(`✅ [L-DCA] Coverage sent ID: ${orderId}.`, 'success');
            return orderId;
        } else {
            log(`⚠️ [L-DCA] Order sent but no valid order_id returned: ${JSON.stringify(orderResult)}`, 'warning');
            return false;
        }
    } catch (error) {
        log(`❌ [L-DCA] Error in coverage execution: ${error.message}`, 'error');
        return false;
    }
}

/**
 * CLOSING SALE (Take Profit).
 */
async function placeLongSellOrder(config, botState, btcAmount, log, updateGeneralBotState, executeOrder) {
    // Protección anti-duplicados
    if (botState?.llastOrder?.order_id) {
        log(`[L-PROFIT] ⚠️ Order already pending (${botState.llastOrder.order_id}). Skipping redundant sell.`, 'warning');
        return false;
    }

    const SYMBOL = config?.symbol || TRADE_SYMBOL;
    const qtyToSell = parseFloat(btcAmount || 0);
    
    if (qtyToSell <= 0 || isNaN(qtyToSell)) {
        log(`[L-PROFIT] ❌ Error: Invalid BTC amount (${btcAmount})`, 'error');
        return false;
    }

    log(`💰 [L-PROFIT] Sending SIGNED closing sale: ${qtyToSell.toFixed(8)} BTC...`, 'info');

    try {
        const orderResult = await executeOrder({ 
            symbol: SYMBOL, 
            side: 'sell', 
            type: 'market', 
            size: qtyToSell 
        });

        const orderId = extractOrderId(orderResult);

        if (orderId) {
            if (updateGeneralBotState) {
                await updateGeneralBotState({
                    llastOrder: {
                        order_id: String(orderId),
                        size: qtyToSell,
                        side: 'sell',
                        timestamp: new Date()
                    }
                });
            }
            log(`✅ [L-PROFIT] Sale sent ID: ${orderId}.`, 'success');
            return orderId;
        } else {
            log(`⚠️ [L-PROFIT] Order sent but no valid order_id returned: ${JSON.stringify(orderResult)}`, 'warning');
            return false;
        }
    } catch (error) {
        log(`❌ [L-PROFIT] Error in sell order: ${error.message}`, 'error');
        return false;
    }
}

/**
 * CANCELLATION: Cancels active order on exchange and resets llastOrder state if confirmed.
 */
async function cancelActiveLongOrder(botState, log, updateGeneralBotState, cancelOrderFn) {
    const lastOrder = botState?.llastOrder;
    if (!lastOrder || !lastOrder.order_id) {
        log(`[L-CANCEL] No active Long order to cancel.`, 'info');
        return true;
    }

    const orderIdString = String(lastOrder.order_id);
    const SYMBOL = botState?.config?.symbol || TRADE_SYMBOL;

    log(`🛑 [L-CANCEL] Requesting cancellation for Long order ID: ${orderIdString}...`, 'warning');

    try {
        if (typeof cancelOrderFn === 'function') {
            await cancelOrderFn({ symbol: SYMBOL, order_id: orderIdString });
        }
        
        if (updateGeneralBotState) {
            await updateGeneralBotState({ llastOrder: null });
        }
        log(`✅ [L-CANCEL] Order ${orderIdString} cancellation processed.`, 'success');
        return true;
    } catch (error) {
        log(`❌ [L-CANCEL] Error canceling order ${orderIdString}: ${error.message}`, 'error');
        return false;
    }
}

module.exports = {
    placeFirstLongOrder,
    placeCoverageBuyOrder,
    placeLongSellOrder,
    cancelActiveLongOrder
};