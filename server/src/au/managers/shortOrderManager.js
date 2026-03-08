// BSB/server/src/au/managers/shortOrderManager.js

/**
 * SHORT ORDER MANAGER:
 * Ejecuta órdenes de venta (apertura/DCA) y compra (cierre) con firmas de estrategia.
 */
const MIN_USDT_VALUE_FOR_BITMART = 5.0; // BitMart suele requerir > 5 USDT

/**
 * Convierte montos USDT a unidades de BTC basadas en el precio actual.
 * Aplica un redondeo hacia abajo (floor) a 6 decimales para evitar errores de precisión.
 */
function convertUsdtToBtc(usdtAmount, currentPrice) {
    if (!currentPrice || currentPrice <= 0) return 0;
    const btcAmount = usdtAmount / currentPrice;
    // BitMart BTC_USDT acepta hasta 6 decimales
    return Math.floor(btcAmount * 1000000) / 1000000;
}

/**
 * APERTURA DE SHORT: Vende BTC (Market Sell).
 */
async function placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, injectedPrice = 0, executeOrder) {
    const { purchaseUsdt } = config.short || {};
    const SYMBOL = config.symbol || 'BTC_USDT';
    const amountNominal = parseFloat(purchaseUsdt || 0);
    const currentPrice = injectedPrice || botState.price || 0; 

    const btcSize = convertUsdtToBtc(amountNominal, currentPrice);

    // Validación de monto mínimo para BitMart
    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[S-FIRST] ⚠️ Monto insuficiente ($${amountNominal}). Mínimo $${MIN_USDT_VALUE_FOR_BITMART}`, 'warning');
        return;
    }

    try {
        log(`🚀 [S-FIRST] Enviando apertura Short (Market Sell): ${btcSize} BTC`, 'info');
        
        const orderResult = await executeOrder({
            symbol: SYMBOL,
            side: 'sell',
            type: 'market',
            size: btcSize // Correcto: En Sell usamos cantidad de activo
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
            log(`✅ [S-FIRST] Orden Short enviada ID: ${orderId}`, 'success');
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

    if (usdtAmount < MIN_USDT_VALUE_FOR_BITMART) return;

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
            log(`✅ [S-DCA] Cobertura Short enviada ID: ${orderId}`, 'success');
        }
    } catch (error) {
        log(`❌ [S-DCA] Error en DCA Short: ${error.message}`, 'error');
    }
}

/**
 * RECOMPRA DE CIERRE (Take Profit).
 * 🟢 AUDITORÍA: Usamos 'size' en lugar de 'notional' para asegurar el cierre exacto del sac.
 */
async function placeShortBuyOrder(config, botState, btcAmount, log, updateGeneralBotState, injectedPrice = 0, executeOrder) { 
    const SYMBOL = config.symbol || 'BTC_USDT';
    
    // 🟢 NOTA: En BitMart, si quieres comprar una cantidad EXACTA de monedas 
    // en una orden Market Buy, algunos endpoints prefieren 'size'. 
    // Sin embargo, para asegurar compatibilidad total, enviamos el btcAmount exacto del SAC.
    
    log(`💰 [S-PROFIT] Recomprando p/ cerrar Short: ${btcAmount.toFixed(6)} BTC...`, 'info');

    try {
        const orderResult = await executeOrder({
            symbol: SYMBOL,
            side: 'buy',
            type: 'market',
            size: btcAmount // Cambiamos notional por size para liquidar el SAC exacto
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

module.exports = {
    placeFirstShortOrder,
    placeCoverageShortOrder,
    placeShortBuyOrder
};