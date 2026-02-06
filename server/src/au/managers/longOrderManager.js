// BSB/server/src/au/managers/longOrderManager.js

const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART } = require('../utils/tradeConstants');

/**
 * APERTURA DE LONG: Solo coloca la orden en BitMart.
 * Utiliza el monto base definido en la configuración.
 */
async function placeFirstLongOrder(config, botState, log, updateBotState, updateGeneralBotState) {
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
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', amountNominal);

        if (orderResult && orderResult.order_id) {
            // ✅ PERSISTENCIA ATÓMICA: Guardamos en llastOrder (raíz)
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
async function placeCoverageBuyOrder(botState, usdtAmount, log, updateGeneralBotState) {
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';

    log(`📉 [L-DCA] Ejecutando cobertura: ${usdtAmount.toFixed(2)} USDT...`, 'warning');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtAmount);

        if (order && order.order_id) {
            // ✅ MIGRADO: Sobrescribimos llastOrder para que el consolidador lo trackee
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
async function placeLongSellOrder(config, botState, btcAmount, log, updateGeneralBotState) {
    const SYMBOL = config.symbol || 'BTC_USDT';
    
    // Evitamos enviar órdenes de tamaño cero o negativo
    if (btcAmount <= 0) {
        log(`[L-PROFIT] ❌ Error: Cantidad de BTC inválida (${btcAmount})`, 'error');
        return;
    }

    log(`💰 [L-PROFIT] Enviando venta de cierre: ${btcAmount.toFixed(8)} BTC...`, 'info');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcAmount);

        if (order && order.order_id) {
            // ✅ MIGRADO: Guardamos la orden de venta en llastOrder para consolidar el ciclo
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
 * CANCELACIÓN: Limpia el rastro de la orden en la raíz y libera el bot.
 */
async function cancelActiveLongOrder(botState, log, updateGeneralBotState) {
    const lastOrder = botState.llastOrder; 
    if (!lastOrder?.order_id) return;
    
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';

    try {
        log(`🛑 [L-CANCEL] Cancelando orden pendiente ${lastOrder.order_id}...`, 'warning');
        const result = await bitmartService.cancelOrder(SYMBOL, lastOrder.order_id);
        
        // El código 1000 indica éxito o que la orden ya no existe (llenada/cancelada previamente)
        if (result?.code === 1000 || result?.message?.includes('already filled')) {
            await updateGeneralBotState({ llastOrder: null });
            log(`✅ [L-CANCEL] Orden removida. Sistema desbloqueado.`, 'success');
        }
    } catch (error) {
        // Si el error es que no se encontró la orden, limpiamos de todos modos para no quedar bloqueados
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