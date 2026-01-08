// BSB/server/src/au/managers/shortOrderManager.js

const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART, BUY_FEE_PERCENT } = require('../utils/tradeConstants');

/**
 * Función Auxiliar: Convierte USDT a BTC y redondea para BitMart.
 */
function convertUsdtToBtc(usdtAmount, currentPrice) {
    if (!currentPrice || currentPrice <= 0) return 0;
    const btcAmount = usdtAmount / currentPrice;
    return Math.floor(btcAmount * 1000000) / 1000000;
}

/**
 * APERTURA DE SHORT: Venta inicial de mercado.
 */
async function placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState) {
    const { purchaseUsdt } = config.short;
    const SYMBOL = config.symbol;
    const amountNominal = parseFloat(purchaseUsdt);
    const currentPrice = botState.price; 
    
    const amountRealCost = amountNominal * (1 + BUY_FEE_PERCENT);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[S-FIRST] ❌ Error: Monto $${amountNominal} inferior al mínimo.`, 'error');
        await updateBotState('NO_COVERAGE', 'short'); 
        return;
    }

    const btcSize = convertUsdtToBtc(amountNominal, currentPrice);

    if (btcSize <= 0) {
        log(`[S-FIRST] ❌ Error: Tamaño de orden BTC inválido (0).`, 'error');
        return;
    }

    const currentSBalance = parseFloat(botState.sbalance || 0);
    log(`🚀 [S-FIRST] Abriendo Short: Vendiendo ${btcSize} BTC (~${amountNominal} USDT)...`, 'info'); 

    try {
        // Al ser 'sell', bitmartService usará 'size' automáticamente (BTC).
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcSize); 

        if (orderResult && orderResult.order_id) {
            const newSBalance = currentSBalance - amountRealCost;
            
            await updateGeneralBotState({
                sbalance: newSBalance,
                sStateData: {
                    ...botState.sStateData,
                    orderCountInCycle: 1,
                    lastOrder: {
                        order_id: orderResult.order_id,
                        side: 'sell',
                        btc_size: btcSize,
                        usdt_amount: amountNominal,
                        usdt_cost_real: amountRealCost,
                        timestamp: new Date()
                    }
                }
            });
            log(`✅ [S-FIRST] Éxito. ID: ${orderResult.order_id}.`, 'success');
        }
    } catch (error) {
        log(`❌ [S-FIRST] Error de API: ${error.message}`, 'error');
    }
}

/**
 * COBERTURA SHORT (DCA): Venta exponencial hacia arriba.
 */
async function placeCoverageShortOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState) { 
    const SYMBOL = botState.config.symbol;
    const currentPrice = botState.price;
    const amountRealCost = usdtAmount * (1 + BUY_FEE_PERCENT);
    const currentBalance = parseFloat(botState.sbalance || 0);

    const btcSize = convertUsdtToBtc(usdtAmount, currentPrice);

    log(`📈 [S-DCA] Cobertura: Vendiendo ${btcSize} BTC (~${usdtAmount.toFixed(2)} USDT)...`, 'warning');
    
    try {
        // Al ser 'sell', bitmartService usará 'size' automáticamente (BTC).
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', btcSize); 

        if (order && order.order_id) {
            const newSBalance = currentBalance - amountRealCost;
            const nextCount = (botState.sStateData.orderCountInCycle || 0) + 1;

            await updateGeneralBotState({
                sbalance: newSBalance,
                sStateData: {
                    ...botState.sStateData,
                    orderCountInCycle: nextCount,
                    lastOrder: {
                        order_id: order.order_id,
                        side: 'sell',
                        btc_size: btcSize,
                        usdt_amount: usdtAmount,
                        usdt_cost_real: amountRealCost,
                        timestamp: new Date()
                    }
                }
            });
            log(`✅ [S-DCA] Orden de cobertura ${nextCount} enviada.`, 'success');
        }
    } catch (error) {
        log(`❌ [S-DCA] Error en DCA: ${error.message}`, 'error');
    }
}

/**
 * RECOMPRA (Take Profit): Cierre de ciclo Short.
 */
async function placeShortBuyOrder(config, botState, btcAmount, log, updateSStateData) { 
    const SYMBOL = config.symbol;
    const currentPrice = botState.price;
    
    // 🟢 CAMBIO CRÍTICO: Para cerrar el short con una orden de COMPRA mercado, 
    // BitMart requiere 'notional' (USDT). Calculamos cuánto USDT necesitamos.
    const usdtNeeded = btcAmount * currentPrice;
    
    log(`💰 [S-PROFIT] Recomprando deuda de ${btcAmount.toFixed(8)} BTC (~${usdtNeeded.toFixed(2)} USDT)...`, 'info');

    try {
        // Al ser 'buy', bitmartService usará 'notional' automáticamente (USDT).
        // Le pasamos usdtNeeded para que BitMart ejecute la compra.
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
            log(`✅ [S-PROFIT] Cierre de ciclo enviado (ID: ${order.order_id}).`, 'success');
        }
    } catch (error) { 
        log(`❌ [S-PROFIT] Error en cierre: ${error.message}`, 'error');
    }
}

/**
 * CANCELACIÓN / LIMPIEZA
 */
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