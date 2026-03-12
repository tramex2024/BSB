// BSB/server/src/au/managers/shortOrderManager.js

/**
 * SHORT ORDER MANAGER:
 * Ejecuta órdenes de venta (apertura/DCA) y compra (cierre) con firmas de estrategia.
 */
const { MIN_USDT_VALUE_FOR_BITMART } = require('../utils/tradeConstants');

/**
 * Convierte montos USDT a unidades de BTC basadas en el precio actual.
 * Aplica un redondeo hacia abajo (floor) a 6 decimales para BitMart.
 */
function convertUsdtToBtc(usdtAmount, currentPrice) {
    if (!currentPrice || currentPrice <= 0) return 0;
    const btcAmount = usdtAmount / currentPrice;
    return Math.floor(btcAmount * 1000000) / 1000000;
}

/**
 * APERTURA DE SHORT: Vende BTC (Market Sell).
 * @param {Function} executeOrder - Función inyectada placeShortOrder (con prefijo S_).
 */
async function placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, injectedPrice = 0, executeOrder) {
    const { purchaseUsdt } = config.short || {};
    const SYMBOL = config.symbol || 'BTC_USDT';
    const amountNominal = parseFloat(purchaseUsdt || 0);
    const currentPrice = injectedPrice || botState.price || 0; 

    const btcSize = convertUsdtToBtc(amountNominal, currentPrice);

    if (btcSize <= 0) {
        log(`[S-FIRST] ❌ Error: Tamaño BTC no válido (${btcSize}).`, 'error');
        return;
    }

    log(`🚀 [S-FIRST] Enviando apertura Short FIRMADA...`, 'info');

    try {
        // ✅ Usamos la función firmada con prefijo S_
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
            log(`✅ [S-FIRST] Orden Short enviada ID: ${orderId}. BTC: ${btcSize}`, 'success');
        }
    } catch (error) {
        log(`❌ [S-FIRST] Error de API en apertura Short: ${error.message}`, 'error');
    }
}

/**
 * DCA SHORT: Vende más BTC (Promedio hacia arriba).
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
            log(`✅ [S-DCA] Cobertura Short enviada ID: ${orderId}. BTC: ${btcSize}`, 'success');
        }
    } catch (error) {
        log(`❌ [S-DCA] Error en DCA Short: ${error.message}`, 'error');
    }
}

/**
 * RECOMPRA DE CIERRE (Take Profit).
 */
async function placeShortBuyOrder(config, botState, btcAmount, log, updateGeneralBotState, injectedPrice = 0, executeOrder) { 
    const SYMBOL = config.symbol || 'BTC_USDT';
    const currentPrice = injectedPrice || botState.price || 0;
    
    // BitMart Market Buy requiere el monto en la moneda de cotización (USDT)
    const usdtNeeded = btcAmount * currentPrice;

    log(`💰 [S-PROFIT] Recomprando p/ cerrar Short (FIRMADA): ${btcAmount.toFixed(6)} BTC...`, 'info');

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
            log(`✅ [S-PROFIT] Recompra enviada ID: ${orderId}.`, 'success');
        }
    } catch (error) { 
        log(`❌ [S-PROFIT] Error en cierre Short: ${error.message}`, 'error');
    }
}

/**
 * CANCELACIÓN: BitmartService directo (sin firma necesaria).
 */
async function cancelActiveShortOrder(botState, log, updateGeneralBotState, userId) {
    // ... Tu lógica original de cancelación es perfecta ...
}

module.exports = {
    placeFirstShortOrder,
    placeCoverageShortOrder,
    placeShortBuyOrder,
    cancelActiveShortOrder
};