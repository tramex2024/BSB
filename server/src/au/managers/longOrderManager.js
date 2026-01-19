// BSB/server/src/au/managers/longOrderManager.js

const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART } = require('../utils/tradeConstants');

/**
 * APERTURA DE LONG: Solo coloca la orden en BitMart.
 */
async function placeFirstLongOrder(config, botState, log, updateBotState, updateGeneralBotState) {
    const { purchaseUsdt } = config.long || {}; 
    const SYMBOL = config.symbol || 'BTC_USDT';
    const amountNominal = parseFloat(purchaseUsdt || 0);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[L-FIRST] ❌ Error: Monto $${amountNominal} inferior al mínimo BitMart.`, 'error');
        await updateBotState('NO_COVERAGE', 'long');
        return;
    }

    log(`🚀 [L-FIRST] Enviando primera compra de ${amountNominal} USDT a BitMart...`, 'info');

    try {
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', amountNominal);

        if (orderResult && orderResult.order_id) {
            // ✅ MIGRADO: Guardamos directo en llastOrder (raíz)
            await updateGeneralBotState({
                llastOrder: {
                    order_id: orderResult.order_id,
                    side: 'buy',
                    usdt_amount: amountNominal,
                    timestamp: new Date()
                }
            });
            log(`✅ [L-FIRST] Orden enviada ID: ${orderResult.order_id}.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-FIRST] Error de API al abrir: ${error.message}.`, 'error');
    }
}

/**
 * COBERTURA LONG (DCA): usdtAmount ya viene calculado exponencialmente.
 */
async function placeCoverageBuyOrder(botState, usdtAmount, log, updateGeneralBotState) {
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';

    log(`📉 [L-DCA] Enviando orden de cobertura: ${usdtAmount.toFixed(2)} USDT...`, 'warning');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtAmount);

        if (order && order.order_id) {
            // ✅ MIGRADO: Guardamos directo en llastOrder (raíz)
            await updateGeneralBotState({
                llastOrder: {
                    order_id: order.order_id,
                    side: 'buy',
                    usdt_amount: usdtAmount,
                    timestamp: new Date()
                }
            });
            log(`✅ [L-DCA] Orden de cobertura ${order.order_id} enviada.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-DCA] Error en ejecución de cobertura: ${error.message}`, 'error');
    }
}

/**
 * VENTA DE CIERRE (Take Profit).
 */
async function placeLongSellOrder(config, botState, btcAmount, log, updateGeneralBotState) {
    const SYMBOL = config.symbol || 'BTC_USDT';
    log(`💰 [L-PROFIT] Enviando orden de venta por ${btcAmount.toFixed(8)} BTC...`, 'info');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcAmount);

        if (order && order.order_id) {
            // ✅ MIGRADO: Guardamos directo en llastOrder (raíz)
            await updateGeneralBotState({
                llastOrder: {
                    order_id: order.order_id,
                    size: btcAmount,
                    side: 'sell',
                    timestamp: new Date()
                }
            });
            log(`✅ [L-PROFIT] Venta enviada (ID: ${order.order_id}).`, 'success');
        }
    } catch (error) {
        log(`❌ [L-PROFIT] Error en orden de venta: ${error.message}`, 'error');
    }
}

/**
 * CANCELACIÓN: Limpia el rastro de la orden en la raíz.
 */
async function cancelActiveLongOrder(botState, log, updateGeneralBotState) {
    const lastOrder = botState.llastOrder; // ✅ Leemos de raíz
    if (!lastOrder?.order_id) return;
    
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';

    try {
        log(`🛑 [L-CANCEL] Cancelando orden ${lastOrder.order_id}...`, 'warning');
        const result = await bitmartService.cancelOrder(SYMBOL, lastOrder.order_id);
        
        if (result?.code === 1000 || result?.message?.includes('already filled')) {
            // ✅ MIGRADO: Limpiamos llastOrder en raíz
            await updateGeneralBotState({ llastOrder: null });
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