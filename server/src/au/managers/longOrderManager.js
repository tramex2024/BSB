// BSB/server/src/au/managers/longOrderManager.js

/**
 * LONG ORDER MANAGER:
 * Responsable de disparar las ejecuciones hacia BitMart y registrar la orden pendiente.
 */

const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART } = require('../utils/tradeConstants');

/**
 * APERTURA DE LONG: Compra inicial.
 */
async function placeFirstLongOrder(config, botState, log, updateBotState, updateGeneralBotState, userId) {
    const { purchaseUsdt } = config.long || {}; 
    const SYMBOL = config.symbol || 'BTC_USDT';
    const amountNominal = parseFloat(purchaseUsdt || 0);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[L-FIRST] ❌ Error: Monto $${amountNominal} inferior al mínimo BitMart.`, 'error');
        await updateBotState('PAUSED', 'long');
        return;
    }

    log(`🚀 [L-FIRST] Enviando compra inicial de ${amountNominal} USDT...`, 'info');

    try {
        // ✅ CONTEXTO MULTIUSUARIO: Se pasa userId para firmar con sus API Keys
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', amountNominal, userId);

        if (orderResult && orderResult.order_id) {
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
 * COBERTURA LONG (DCA): usdtAmount ya viene calculado por el motor exponencial.
 */
async function placeCoverageBuyOrder(botState, usdtAmount, log, updateGeneralBotState, userId) {
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';

    log(`📉 [L-DCA] Ejecutando cobertura: ${usdtAmount.toFixed(2)} USDT...`, 'warning');

    try {
        // ✅ CONTEXTO MULTIUSUARIO
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtAmount, userId);

        if (order && order.order_id) {
            await updateGeneralBotState({
                llastOrder: {
                    order_id: order.order_id,
                    side: 'buy',
                    usdt_amount: usdtAmount,
                    timestamp: new Date()
                }
            });
            log(`✅ [L-DCA] Cobertura enviada ID: ${order.order_id}.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-DCA] Error en ejecución de cobertura: ${error.message}`, 'error');
    }
}

/**
 * VENTA DE CIERRE (Take Profit).
 */
async function placeLongSellOrder(config, botState, btcAmount, log, updateGeneralBotState, userId) {
    const SYMBOL = config.symbol || 'BTC_USDT';
    
    if (btcAmount <= 0) {
        log(`[L-PROFIT] ❌ Error: Cantidad de BTC inválida (${btcAmount})`, 'error');
        return;
    }

    log(`💰 [L-PROFIT] Enviando venta de cierre: ${btcAmount.toFixed(8)} BTC...`, 'info');

    try {
        // ✅ CONTEXTO MULTIUSUARIO
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcAmount, userId);

        if (order && order.order_id) {
            await updateGeneralBotState({
                llastOrder: {
                    order_id: order.order_id,
                    size: btcAmount,
                    side: 'sell',
                    timestamp: new Date()
                }
            });
            log(`✅ [L-PROFIT] Venta enviada ID: ${order.order_id}.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-PROFIT] Error en orden de venta: ${error.message}`, 'error');
    }
}

/**
 * CANCELACIÓN: Limpia la orden en el exchange y libera el bot.
 */
async function cancelActiveLongOrder(botState, log, updateGeneralBotState, userId) {
    const lastOrder = botState.llastOrder; 
    if (!lastOrder?.order_id) return;
    
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';

    try {
        log(`🛑 [L-CANCEL] Cancelando orden pendiente ${lastOrder.order_id}...`, 'warning');
        // ✅ CONTEXTO MULTIUSUARIO
        const result = await bitmartService.cancelOrder(SYMBOL, lastOrder.order_id, userId);
        
        if (result?.code === 1000 || result?.message?.includes('already filled')) {
            await updateGeneralBotState({ llastOrder: null });
            log(`✅ [L-CANCEL] Orden removida. Sistema desbloqueado.`, 'success');
        }
    } catch (error) {
        if (error.message.includes('not found') || error.message.includes('400')) {
            await updateGeneralBotState({ llastOrder: null });
            log(`⚠️ [L-CANCEL] Orden no encontrada en exchange. Limpiando estado local.`, 'warning');
        } else {
            log(`❌ [L-CANCEL] Error: ${error.message}`, 'error');
        }
    }
}

module.exports = {
    placeFirstLongOrder,
    placeCoverageBuyOrder,
    placeLongSellOrder,
    cancelActiveLongOrder
};