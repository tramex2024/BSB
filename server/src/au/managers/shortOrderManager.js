// BSB/server/src/au/managers/shortOrderManager.js

const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART, BUY_FEE_PERCENT } = require('../utils/tradeConstants');

/**
 * APERTURA DE SHORT: Venta inicial de mercado basada en purchaseUsdt.
 */
async function placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState) {
    const { purchaseUsdt } = config.short;
    const SYMBOL = config.symbol;
    const amountNominal = parseFloat(purchaseUsdt);
    
    // El costo real incluye la comisión para descontarlo del balance interno (sbalance)
    const amountRealCost = amountNominal * (1 + BUY_FEE_PERCENT);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[S-FIRST] ❌ Error: Monto $${amountNominal} inferior al mínimo.`, 'error');
        await updateBotState('NO_COVERAGE', 'short'); 
        return;
    }

    const currentSBalance = parseFloat(botState.sbalance || 0);
    log(`🚀 [S-FIRST] Abriendo Short con ${amountNominal} USDT...`, 'info'); 

    try {
        // Usamos sell market para abrir el Short (vender lo que no tenemos)
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', amountNominal); 

        if (orderResult && orderResult.order_id) {
            const newSBalance = currentSBalance - amountRealCost;
            
            await updateGeneralBotState({
                sbalance: newSBalance,
                sStateData: {
                    ...botState.sStateData,
                    orderCountInCycle: 1, // Primer paso del ciclo
                    lastOrder: {
                        order_id: orderResult.order_id,
                        side: 'sell',
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
 * COBERTURA SHORT (DCA): Venta exponencial basada en requiredCoverageAmount.
 */
async function placeCoverageShortOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState) { 
    const SYMBOL = botState.config.symbol;
    const amountRealCost = usdtAmount * (1 + BUY_FEE_PERCENT);
    const currentBalance = parseFloat(botState.sbalance || 0);

    log(`📈 [S-DCA] Ejecutando cobertura exponencial: ${usdtAmount.toFixed(2)} USDT...`, 'warning');
    
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', usdtAmount); 

        if (order && order.order_id) {
            const newSBalance = currentBalance - amountRealCost;
            
            // Incrementamos el contador de órdenes para el cálculo de promedios
            const nextCount = (botState.sStateData.orderCountInCycle || 0) + 1;

            await updateGeneralBotState({
                sbalance: newSBalance,
                sStateData: {
                    ...botState.sStateData,
                    orderCountInCycle: nextCount,
                    lastOrder: {
                        order_id: order.order_id,
                        side: 'sell',
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
 * Aquí btcAmount es el AC (Acumulado) total vendido durante el ciclo.
 */
async function placeShortBuyOrder(config, botState, btcAmount, log, updateSStateData) { 
    const SYMBOL = config.symbol;
    // En Short, para ganar dinero RECOMPRAMOS (buy) el BTC acumulado (ac)
    log(`💰 [S-PROFIT] Recomprando ${btcAmount.toFixed(8)} BTC para cerrar Short...`, 'info');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', btcAmount); 

        if (order && order.order_id) {
            await updateSStateData({
                lastOrder: {
                    order_id: order.order_id,
                    size: btcAmount, // Guardamos cuánto BTC recompramos para el consolidador
                    side: 'buy',
                    timestamp: new Date()
                }
            });
            log(`✅ [S-PROFIT] Orden de cierre enviada (ID: ${order.order_id}).`, 'success');
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