// BSB/server/src/au/managers/shortOrderManager.js

const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART } = require('../utils/tradeConstants');

function convertUsdtToBtc(usdtAmount, currentPrice) {
    if (!currentPrice || currentPrice <= 0) return 0;
    const btcAmount = usdtAmount / currentPrice;
    // Redondeo a 6 decimales para precisión de BitMart en BTC
    return Math.floor(btcAmount * 1000000) / 1000000;
}

/**
 * APERTURA DE SHORT: Vende BTC para abrir posición.
 */
async function placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState, injectedPrice = 0) {
    // ✅ CORRECCIÓN: Referencia a la nueva jerarquía config.short
    const { purchaseUsdt } = config.short || {};
    const SYMBOL = config.symbol || 'BTC_USDT';
    const amountNominal = parseFloat(purchaseUsdt || 0);
    
    // Prioridad: Precio inyectado (WebSocket) > Precio DB
    const currentPrice = injectedPrice || botState.price || 0; 

    if (currentPrice <= 0) {
        log(`[S-FIRST] ⏳ Abortando: Precio de mercado no disponible.`, 'warning');
        return;
    }

    const btcSize = convertUsdtToBtc(amountNominal, currentPrice);

    if (btcSize <= 0) {
        log(`[S-FIRST] ❌ Error: Tamaño BTC inválido (${btcSize}).`, 'error');
        return;
    }

    log(`🚀 [S-FIRST] Abriendo Short: Vendiendo ${btcSize} BTC @ ${currentPrice}...`, 'info'); 

    try {
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcSize); 

        if (orderResult && orderResult.order_id) {
            await updateGeneralBotState({
                sStateData: {
                    ...(botState.sStateData || {}),
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
 * DCA SHORT: Vende más BTC para promediar a la baja (subir el PPC).
 */
async function placeCoverageShortOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState, injectedPrice = 0) { 
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';
    const currentPrice = injectedPrice || botState.price || 0;
    const btcSize = convertUsdtToBtc(usdtAmount, currentPrice);

    if (currentPrice <= 0 || btcSize <= 0) {
        log(`[S-DCA] ❌ Error: Sin precio válido para promediar.`, 'error');
        return;
    }

    log(`📈 [S-DCA] Cobertura Short: ${btcSize} BTC (~${usdtAmount.toFixed(2)} USDT)...`, 'warning');
    
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcSize); 

        if (order && order.order_id) {
            await updateGeneralBotState({
                sStateData: {
                    ...(botState.sStateData || {}),
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
 * RECOMPRA DE CIERRE (Take Profit): Compra BTC para saldar la deuda.
 */
async function placeShortBuyOrder(config, botState, btcAmount, log, updateSStateData, injectedPrice = 0, dependencies = {}) { 
    const SYMBOL = config.symbol || 'BTC_USDT';
    const currentPrice = injectedPrice || botState.price || 0;
    // En BitMart, para recomprar ('buy') una cantidad de BTC en market, a veces se usa el total en USDT
    const usdtNeeded = btcAmount * currentPrice;
    
    if (usdtNeeded <= 0) return;

    log(`💰 [S-PROFIT] Recomprando ${btcAmount.toFixed(8)} BTC para cerrar ciclo...`, 'info');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtNeeded); 

        if (order && order.order_id) {
            await updateSStateData({
                lastOrder: {
                    order_id: order.order_id,
                    size: btcAmount, 
                    side: 'buy',
                    timestamp: new Date(),
                    // Guardamos las dependencias para que el Consolidator cierre el ciclo
                    dependencies: {
                        logSuccessfulCycle: dependencies.logSuccessfulCycle,
                        updateBotState: dependencies.updateBotState,
                        updateGeneralBotState: dependencies.updateGeneralBotState
                    }
                }
            });
            log(`✅ [S-PROFIT] Cierre enviado ID: ${order.order_id}.`, 'success');
        }
    } catch (error) { 
        log(`❌ [S-PROFIT] Error en cierre: ${error.message}`, 'error');
    }
}

async function cancelActiveShortOrder(botState, log, updateSStateData) {
    const sStateData = botState.sStateData || {};
    const lastOrder = sStateData.lastOrder;
    if (!lastOrder?.order_id) return;
    const SYMBOL = botState.config?.symbol || 'BTC_USDT';
    
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