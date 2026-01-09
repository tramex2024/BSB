// BSB/server/src/au/managers/shortOrderManager.js

const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART } = require('../utils/tradeConstants');

/**
 * Función Auxiliar: Convierte USDT a BTC y redondea para BitMart.
 */
function convertUsdtToBtc(usdtAmount, currentPrice) {
    if (!currentPrice || currentPrice <= 0) return 0;
    const btcAmount = usdtAmount / currentPrice;
    return Math.floor(btcAmount * 1000000) / 1000000;
}

/**
 * APERTURA DE SHORT: Venta inicial. NO resta sbalance aquí.
 */
async function placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState) {
    const { purchaseUsdt } = config.short;
    const SYMBOL = config.symbol;
    const amountNominal = parseFloat(purchaseUsdt);
    const currentPrice = botState.price || botState.lastExecutionPrice || 0; 

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[S-FIRST] ❌ Error: Monto $${amountNominal} inferior al mínimo.`, 'error');
        await updateBotState('NO_COVERAGE', 'short'); 
        return;
    }

    const btcSize = convertUsdtToBtc(amountNominal, currentPrice);

    if (btcSize <= 0) {
        log(`[S-FIRST] ❌ Error: Tamaño BTC inválido. Precio actual: ${currentPrice}`, 'error');
        return;
    }

    log(`🚀 [S-FIRST] Abriendo Short: Enviando venta de ${btcSize} BTC...`, 'info'); 

    try {
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcSize); 

        if (orderResult && orderResult.order_id) {
            // NOTA: sbalance se queda intacto. Se restará en ShortDataManager al confirmar filled.
            await updateGeneralBotState({
                sStateData: {
                    ...botState.sStateData,
                    lastOrder: {
                        order_id: orderResult.order_id,
                        side: 'sell',
                        btc_size: btcSize,
                        usdt_amount: amountNominal,
                        timestamp: new Date()
                    }
                }
            });
            log(`✅ [S-FIRST] Orden Short enviada ID: ${orderResult.order_id}.`, 'success');
        }
    } catch (error) {
        log(`❌ [S-FIRST] Error de API: ${error.message}`, 'error');
    }
}

/**
 * COBERTURA SHORT (DCA): Venta exponencial. NO resta sbalance aquí.
 */
async function placeCoverageShortOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState) { 
    const SYMBOL = botState.config.symbol;
    const currentPrice = botState.price || botState.lStateData.lastExecutionPrice || 0;
    const btcSize = convertUsdtToBtc(usdtAmount, currentPrice);

    log(`📈 [S-DCA] Enviando cobertura Short: ${btcSize} BTC (~${usdtAmount.toFixed(2)} USDT)...`, 'warning');
    
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcSize); 

        if (order && order.order_id) {
            await updateGeneralBotState({
                sStateData: {
                    ...botState.sStateData,
                    lastOrder: {
                        order_id: order.order_id,
                        side: 'sell',
                        btc_size: btcSize,
                        usdt_amount: usdtAmount,
                        timestamp: new Date()
                    }
                }
            });
            log(`✅ [S-DCA] Orden de cobertura enviada ID: ${order.order_id}.`, 'success');
        }
    } catch (error) {
        log(`❌ [S-DCA] Error en DCA Short: ${error.message}`, 'error');
    }
}

/**
 * RECOMPRA (Take Profit): Cierre de ciclo Short.
 */
async function placeShortBuyOrder(config, botState, btcAmount, log, updateSStateData) { 
    const SYMBOL = config.symbol;
    const currentPrice = botState.price;
    const usdtNeeded = btcAmount * currentPrice;
    
    log(`💰 [S-PROFIT] Recomprando deuda de ${btcAmount.toFixed(8)} BTC para cerrar...`, 'info');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtNeeded); 

        if (order && order.order_id) {
            await updateSStateData({
                lastOrder: {
                    order_id: order.order_id,
                    size: btcAmount, 
                    side: 'buy',
                    timestamp: new Date()
                }
            });
            log(`✅ [S-PROFIT] Cierre enviado ID: ${order.order_id}.`, 'success');
        }
    } catch (error) { 
        log(`❌ [S-PROFIT] Error en cierre: ${error.message}`, 'error');
    }
}

async function cancelActiveShortOrder(botState, log, updateSStateData) {
    const lastOrder = botState.sStateData.lastOrder;
    if (!lastOrder?.order_id) return;
    const SYMBOL = botState.config.symbol;
    
    try {
        log(`🛑 [S-CANCEL] Cancelando orden ${lastOrder.order_id}...`, 'warning');
        const result = await bitmartService.cancelOrder(SYMBOL, lastOrder.order_id); 
        
        if (result?.code === 1000 || result?.message?.includes('already filled')) {
            await updateSStateData({ lastOrder: null });
            log(`✅ [S-CANCEL] Sistema liberado.`, 'success');
        }
    } catch (error) {
        log(`❌ [S-CANCEL] Error al cancelar: ${error.message}`, 'error');
    }
}

module.exports = {
    placeFirstShortOrder,
    placeCoverageShortOrder,
    placeShortBuyOrder,
    cancelActiveShortOrder
};