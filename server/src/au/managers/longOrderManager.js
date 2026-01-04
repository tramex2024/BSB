// BSB/server/src/au/managers/longOrderManager.js

const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART, SELL_FEE_PERCENT } = require('../utils/tradeConstants');

/**
 * APERTURA DE LONG: Compra inicial de mercado.
 */
async function placeFirstLongOrder(config, botState, log, updateBotState, updateGeneralBotState) {
    const { purchaseUsdt } = config.long;
    const SYMBOL = config.symbol;
    const amountNominal = parseFloat(purchaseUsdt);
    const amountRealCost = amountNominal * (1 + SELL_FEE_PERCENT);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[L-FIRST] ❌ Error: Monto $${amountNominal} inferior al mínimo.`, 'error');
        await updateBotState('NO_COVERAGE', 'long');
        return;
    }

    const currentLBalance = parseFloat(botState.lbalance || 0);
    log(`🚀 [L-FIRST] Iniciando ciclo Long con ${amountNominal} USDT...`, 'info');

    try {
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', amountNominal);

        if (orderResult && orderResult.order_id) {
            const newLBalance = currentLBalance - amountRealCost;
            await updateGeneralBotState({
                lbalance: newLBalance,
                lStateData: {
                    ...botState.lStateData,
                    lastOrder: {
                        order_id: orderResult.order_id,
                        side: 'buy',
                        usdt_amount: amountNominal,
                        usdt_cost_real: amountRealCost,
                        timestamp: new Date()
                    }
                }
            });
            log(`✅ [L-FIRST] Éxito. ID: ${orderResult.order_id}. Balance Long: ${newLBalance.toFixed(2)}`, 'success');
        }
    } catch (error) {
        log(`❌ [L-FIRST] Error de API al abrir: ${error.message}. Reintentando...`, 'error');
    }
}

/**
 * COBERTURA LONG (DCA): Compra exponencial.
 */
async function placeCoverageBuyOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState) {
    const SYMBOL = botState.config.symbol;
    const amountRealCost = usdtAmount * (1 + SELL_FEE_PERCENT);
    const currentBalance = parseFloat(botState.lbalance || 0);

    log(`📉 [L-DCA] Ejecutando cobertura exponencial: ${usdtAmount.toFixed(2)} USDT...`, 'warning');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtAmount);

        if (order && order.order_id) {
            const newLBalance = currentBalance - amountRealCost;
            await updateGeneralBotState({
                lbalance: newLBalance,
                lStateData: {
                    ...botState.lStateData,
                    lastOrder: {
                        order_id: order.order_id,
                        side: 'buy',
                        usdt_amount: usdtAmount,
                        usdt_cost_real: amountRealCost,
                        timestamp: new Date()
                    }
                }
            });
            log(`✅ [L-DCA] Orden ${order.order_id} registrada.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-DCA] Error en ejecución: ${error.message}`, 'error');
    }
}

/**
 * VENTA DE CIERRE (Take Profit).
 */
async function placeLongSellOrder(config, botState, btcAmount, log, updateLStateData) {
    const SYMBOL = config.symbol;
    log(`💰 [L-PROFIT] Vendiendo ${btcAmount.toFixed(8)} BTC para cerrar ciclo...`, 'info');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcAmount);

        if (order && order.order_id) {
            await updateLStateData({
                lastOrder: {
                    order_id: order.order_id,
                    size: btcAmount,
                    side: 'sell',
                    timestamp: new Date()
                }
            });
            log(`✅ [L-PROFIT] Venta enviada (ID: ${order.order_id}).`, 'success');
        }
    } catch (error) {
        log(`❌ [L-PROFIT] Error en venta: ${error.message}`, 'error');
    }
}

/**
 * CANCELACIÓN DE ÓRDENES.
 */
async function cancelActiveLongOrder(botState, log, updateLStateData) {
    const lastOrder = botState.lStateData.lastOrder;
    if (!lastOrder?.order_id) return;

    const SYMBOL = botState.config.symbol;

    try {
        log(`🛑 [L-CANCEL] Cancelando orden ${lastOrder.order_id}...`, 'warning');
        const result = await bitmartService.cancelOrder(SYMBOL, lastOrder.order_id);

        if (result?.code === 1000 || result?.message?.includes('already filled')) {
            await updateLStateData({ lastOrder: null });
            log(`✅ [L-CANCEL] Sistema desbloqueado.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-CANCEL] Error: ${error.message}`, 'error');
    }
}

module.exports = {
    placeFirstLongOrder,
    placeCoverageBuyOrder,
    placeLongSellOrder,
    cancelActiveLongOrder
};