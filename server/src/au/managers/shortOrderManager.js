// BSB/server/src/au/managers/shortOrderManager.js

const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART } = require('../utils/tradeConstants');

/**
 * Utilidad para convertir montos USDT a unidades de BTC basadas en el precio actual.
 * Aplica un redondeo hacia abajo (floor) a 6 decimales para evitar errores de precisión en BitMart.
 */
function convertUsdtToBtc(usdtAmount, currentPrice) {
    if (!currentPrice || currentPrice <= 0) return 0;
    const btcAmount = usdtAmount / currentPrice;
    return Math.floor(btcAmount * 1000000) / 1000000;
}

/**
 * APERTURA DE SHORT: Vende BTC para abrir posición.
 */
async function placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, injectedPrice = 0) {
    const { purchaseUsdt } = config.short || {};
    const SYMBOL = config.symbol || 'BTC_USDT';
    const amountNominal = parseFloat(purchaseUsdt || 0);
    
    // Prioridad de precio: inyectado > estado actual
    const currentPrice = injectedPrice || botState.price || 0; 

    if (currentPrice <= 0) {
        log(`[S-FIRST] ⏳ Abortando: Precio de mercado no disponible para calcular el tamaño del Short.`, 'warning');
        return;
    }

    const btcSize = convertUsdtToBtc(amountNominal, currentPrice);

    if (btcSize <= 0) {
        log(`[S-FIRST] ❌ Error: Tamaño BTC calculado no válido (${btcSize}).`, 'error');
        return;
    }

    log(`🚀 [S-FIRST] Abriendo Short: Vendiendo ${btcSize} BTC (~${amountNominal} USDT) @ ${currentPrice}...`, 'info'); 

    try {
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcSize); 

        if (orderResult && orderResult.order_id) {
            // ✅ CONCILIACIÓN: No inicializamos sac ni sai aquí con valores teóricos.
            // Solo marcamos el inicio del ciclo y la orden pendiente.
            await updateGeneralBotState({
                sstartTime: new Date(),
                socc: 1, 
                slastOrder: {                               
                    order_id: orderResult.order_id,
                    side: 'sell',
                    btc_size: btcSize,
                    usdt_amount: amountNominal, // Esto es solo informativo para el log
                    timestamp: new Date()
                }
            });
            log(`✅ [S-FIRST] Orden Short enviada ID: ${orderResult.order_id}.`, 'success');
        }
    } catch (error) {
        log(`❌ [S-FIRST] Error de API en apertura: ${error.message}`, 'error');
    }
}

/**
 * DCA SHORT: Vende más BTC para promediar el precio hacia arriba (DCA Exponencial).
 */
async function placeCoverageShortOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState, injectedPrice = 0) { 
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';
    const currentPrice = injectedPrice || botState.price || 0;
    const btcSize = convertUsdtToBtc(usdtAmount, currentPrice);

    if (currentPrice <= 0 || btcSize <= 0) {
        log(`[S-DCA] ❌ Error: Sin precio válido para calcular cobertura Short.`, 'error');
        return;
    }

    log(`📈 [S-DCA] Cobertura Short: Vendiendo ${btcSize} BTC (~${usdtAmount.toFixed(2)} USDT)...`, 'warning');
    
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcSize); 

        if (order && order.order_id) {
            // ✅ MIGRADO: Actualizamos slastOrder en raíz para monitoreo del consolidante
            await updateGeneralBotState({
                slastOrder: {
                    order_id: order.order_id,
                    side: 'sell',
                    btc_size: btcSize,
                    usdt_amount: usdtAmount,
                    timestamp: new Date()
                }
            });
            log(`✅ [S-DCA] Cobertura Short enviada ID: ${order.order_id}.`, 'success');
        }
    } catch (error) {
        log(`❌ [S-DCA] Error en ejecución de DCA Short: ${error.message}`, 'error');
    }
}

/**
 * RECOMPRA DE CIERRE (Take Profit): Compra BTC para saldar la deuda y realizar el profit.
 */
async function placeShortBuyOrder(config, botState, btcAmount, log, updateGeneralBotState, injectedPrice = 0, dependencies = {}) { 
    const SYMBOL = config.symbol || 'BTC_USDT';
    const currentPrice = injectedPrice || botState.price || 0;
    
    // Bitmart Market Buy requiere el monto total en USDT que quieres gastar para comprar BTC
    const usdtNeeded = btcAmount * currentPrice;
    
    if (usdtNeeded <= 0) {
        log(`[S-PROFIT] ❌ Error: Monto USDT calculado para recompra es cero.`, 'error');
        return;
    }

    log(`💰 [S-PROFIT] Recomprando ${btcAmount.toFixed(6)} BTC para cerrar ciclo...`, 'info');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtNeeded); 

        if (order && order.order_id) {
            // ✅ MIGRADO: Guardamos orden de compra en slastOrder (raíz)
            await updateGeneralBotState({
                slastOrder: {
                    order_id: order.order_id,
                    size: btcAmount, 
                    side: 'buy',
                    timestamp: new Date(),
                    // Inyectamos dependencias necesarias para que el consolidador finalice el ciclo
                    dependencies: {
                        logSuccessfulCycle: dependencies.logSuccessfulCycle,
                        updateBotState: dependencies.updateBotState,
                        updateGeneralBotState: dependencies.updateGeneralBotState
                    }
                }
            });
            log(`✅ [S-PROFIT] Recompra de cierre enviada ID: ${order.order_id}.`, 'success');
        }
    } catch (error) { 
        log(`❌ [S-PROFIT] Error en orden de cierre: ${error.message}`, 'error');
    }
}

/**
 * CANCELACIÓN: Limpia el rastro de la orden Short en la raíz.
 */
async function cancelActiveShortOrder(botState, log, updateGeneralBotState) {
    const lastOrder = botState.slastOrder;
    if (!lastOrder?.order_id) return;
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';
    
    try {
        log(`🛑 [S-CANCEL] Cancelando orden pendiente ${lastOrder.order_id}...`, 'warning');
        const result = await bitmartService.cancelOrder(SYMBOL, lastOrder.order_id); 
        
        if (result?.code === 1000 || result?.message?.includes('already filled')) {
            await updateGeneralBotState({ slastOrder: null });
            log(`✅ [S-CANCEL] Orden Short removida. Sistema liberado.`, 'success');
        }
    } catch (error) {
        // Limpieza forzada si la orden no existe en el exchange
        if (error.message.includes('not found') || error.message.includes('400')) {
            await updateGeneralBotState({ slastOrder: null });
            log(`⚠️ [S-CANCEL] Orden no encontrada en exchange. Limpiando estado local.`, 'warning');
        } else {
            log(`❌ [S-CANCEL] Error al cancelar Short: ${error.message}`, 'error');
        }
    }
}

module.exports = {
    placeFirstShortOrder,
    placeCoverageShortOrder,
    placeShortBuyOrder,
    cancelActiveShortOrder
};