// BSB/server/src/au/managers/longOrderManager.js

/**
 * LONG ORDER MANAGER:
 * Responsable de disparar las ejecuciones hacia BitMart utilizando funciones firmadas.
 */
const { MIN_USDT_VALUE_FOR_BITMART } = require('../utils/tradeConstants');

/**
 * APERTURA DE LONG: Compra inicial (Market Buy).
 * @param {Function} executeOrder - Función inyectada placeLongOrder que ya incluye firma y prefijo.
 */
async function placeFirstLongOrder(config, botState, log, updateBotState, updateGeneralBotState, executeOrder) {
    const { purchaseUsdt } = config.long || {}; 
    const SYMBOL = config.symbol || 'BTC_USDT';
    const amountNominal = parseFloat(purchaseUsdt || 0);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[L-FIRST] ❌ Error: Monto $${amountNominal} inferior al mínimo ($${MIN_USDT_VALUE_FOR_BITMART}).`, 'error');
        await updateBotState('PAUSED', 'long');
        return;
    }

    log(`🚀 [L-FIRST] Enviando compra inicial FIRMADA de ${amountNominal} USDT...`, 'info');

    try {
        // ✅ Utilizamos la función inyectada para que nazca con prefijo L_
        // Dependiendo de cómo definas placeLongOrder, pasamos el objeto de parámetros.
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
            log(`✅ [L-FIRST] Orden enviada ID: ${orderId}.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-FIRST] Error de API al abrir: ${error.message}.`, 'error');
    }
}

/**
 * COBERTURA LONG (DCA).
 */
async function placeCoverageBuyOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState, executeOrder) {
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';

    log(`📉 [L-DCA] Ejecutando cobertura FIRMADA: ${usdtAmount.toFixed(2)} USDT...`, 'warning');

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
            log(`✅ [L-DCA] Cobertura enviada ID: ${orderId}.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-DCA] Error en ejecución de cobertura: ${error.message}`, 'error');
    }
}

/**
 * VENTA DE CIERRE (Take Profit).
 */
async function placeLongSellOrder(config, botState, btcAmount, log, updateGeneralBotState, executeOrder) {
    const SYMBOL = config.symbol || 'BTC_USDT';
    
    if (btcAmount <= 0) {
        log(`[L-PROFIT] ❌ Error: Cantidad de BTC inválida (${btcAmount})`, 'error');
        return;
    }

    log(`💰 [L-PROFIT] Enviando venta de cierre FIRMADA: ${btcAmount.toFixed(8)} BTC...`, 'info');

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
            log(`✅ [L-PROFIT] Venta enviada ID: ${orderId}.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-PROFIT] Error en orden de venta: ${error.message}`, 'error');
    }
}

/**
 * CANCELACIÓN: Esta se mantiene con bitmartService directo ya que no requiere prefijo.
 */
async function cancelActiveLongOrder(botState, log, updateGeneralBotState, userId) {
    // Nota: Aquí faltaría importar bitmartService si se va a usar directamente,
    // o pasar una función inyectada para mantener la consistencia multiusuario.
}

module.exports = {
    placeFirstLongOrder,
    placeCoverageBuyOrder,
    placeLongSellOrder,
    cancelActiveLongOrder
};