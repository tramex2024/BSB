// BSB/server/src/au/managers/shortOrderManager.js

const bitmartService = require('../../../services/bitmartService');

/**
 * Utilidad para convertir montos USDT a unidades de BTC basadas en el precio actual.
 * Aplica un redondeo hacia abajo (floor) a 6 decimales para BitMart.
 */
function convertUsdtToBtc(usdtAmount, currentPrice) {
    if (!currentPrice || currentPrice <= 0) return 0;
    const btcAmount = usdtAmount / currentPrice;
    return Math.floor(btcAmount * 1000000) / 1000000;
}

/**
 * APERTURA DE SHORT: Vende BTC (Market Sell) para abrir posición.
 */
async function placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, injectedPrice = 0, userId) {
    const { purchaseUsdt } = config.short || {};
    const SYMBOL = config.symbol || 'BTC_USDT';
    const amountNominal = parseFloat(purchaseUsdt || 0);
    const currentPrice = injectedPrice || botState.price || 0; 

    if (currentPrice <= 0) {
        log(`[S-FIRST] ⏳ Abortando: Precio de mercado no disponible para calcular el tamaño.`, 'warning');
        return;
    }

    const btcSize = convertUsdtToBtc(amountNominal, currentPrice);

    if (btcSize <= 0) {
        log(`[S-FIRST] ❌ Error: Tamaño BTC no válido (${btcSize}).`, 'error');
        return;
    }

    try {
        // ✅ CONTEXTO MULTIUSUARIO: Se firma con las credenciales del userId
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcSize, userId); 

        if (orderResult && orderResult.order_id) {
            await updateGeneralBotState({
                sstartTime: new Date(),
                socc: 1, 
                slastOrder: {                                     
                    order_id: orderResult.order_id,
                    side: 'sell',
                    btc_size: btcSize,
                    usdt_amount: amountNominal,
                    timestamp: new Date()
                }
            });
            log(`✅ [S-FIRST] Orden Short enviada ID: ${orderResult.order_id}. BTC: ${btcSize}`, 'success');
        }
    } catch (error) {
        log(`❌ [S-FIRST] Error de API en apertura Short: ${error.message}`, 'error');
    }
}

/**
 * DCA SHORT: Vende más BTC para promediar el precio hacia arriba.
 */
async function placeCoverageShortOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState, injectedPrice = 0, userId) { 
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';
    const currentPrice = injectedPrice || botState.price || 0;
    const btcSize = convertUsdtToBtc(usdtAmount, currentPrice);

    if (currentPrice <= 0 || btcSize <= 0) {
        log(`[S-DCA] ❌ Error: Sin precio válido para cobertura Short.`, 'error');
        return;
    }

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcSize, userId); 

        if (order && order.order_id) {
            await updateGeneralBotState({
                slastOrder: {
                    order_id: order.order_id,
                    side: 'sell',
                    btc_size: btcSize,
                    usdt_amount: usdtAmount,
                    timestamp: new Date()
                }
            });
            log(`✅ [S-DCA] Cobertura Short enviada ID: ${order.order_id}. BTC: ${btcSize}`, 'success');
        }
    } catch (error) {
        log(`❌ [S-DCA] Error en DCA Short: ${error.message}`, 'error');
    }
}

/**
 * RECOMPRA DE CIERRE (Take Profit): Compra BTC (Market Buy) para cerrar el Short.
 */
async function placeShortBuyOrder(config, botState, btcAmount, log, updateGeneralBotState, injectedPrice = 0, dependencies = {}) { 
    const SYMBOL = config.symbol || 'BTC_USDT';
    const currentPrice = injectedPrice || botState.price || 0;
    const { userId } = dependencies;
    
    // BitMart Market Buy requiere el monto en la moneda de cotización (USDT)
    const usdtNeeded = btcAmount * currentPrice;
    
    if (usdtNeeded <= 0) {
        log(`[S-PROFIT] ❌ Error: El monto USDT calculado es cero.`, 'error');
        return;
    }

    log(`💰 [S-PROFIT] Recomprando p/ cerrar: ${btcAmount.toFixed(6)} BTC (~${usdtNeeded.toFixed(2)} USDT)...`, 'info');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtNeeded, userId); 

        if (order && order.order_id) {
            await updateGeneralBotState({
                slastOrder: {
                    order_id: order.order_id,
                    size: btcAmount, 
                    side: 'buy',
                    timestamp: new Date(),
                    // Pasamos las dependencias para que el consolidador tenga todo el contexto del usuario
                    dependencies: {
                        userId: userId,
                        logSuccessfulCycle: dependencies.logSuccessfulCycle,
                        updateBotState: dependencies.updateBotState,
                        updateGeneralBotState: dependencies.updateGeneralBotState
                    }
                }
            });
            log(`✅ [S-PROFIT] Recompra de cierre enviada ID: ${order.order_id}.`, 'success');
        }
    } catch (error) { 
        log(`❌ [S-PROFIT] Error en orden de cierre Short: ${error.message}`, 'error');
    }
}

/**
 * CANCELACIÓN: Limpia la orden en el exchange y el estado local.
 */
async function cancelActiveShortOrder(botState, log, updateGeneralBotState, userId) {
    const lastOrder = botState.slastOrder;
    if (!lastOrder?.order_id) return;
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';
    
    try {
        log(`🛑 [S-CANCEL] Cancelando orden Short pendiente ${lastOrder.order_id}...`, 'warning');
        const result = await bitmartService.cancelOrder(SYMBOL, lastOrder.order_id, userId); 
        
        if (result?.code === 1000 || result?.message?.includes('already filled')) {
            await updateGeneralBotState({ slastOrder: null });
            log(`✅ [S-CANCEL] Orden removida. Sistema Short desbloqueado.`, 'success');
        }
    } catch (error) {
        if (error.message.includes('not found') || error.message.includes('400')) {
            await updateGeneralBotState({ slastOrder: null });
            log(`⚠️ [S-CANCEL] Orden no encontrada en BitMart. Limpiando estado.`, 'warning');
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