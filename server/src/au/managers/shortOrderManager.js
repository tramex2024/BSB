// BSB/server/src/au/managers/shortOrderManager.js

const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART, BUY_FEE_PERCENT } = require('../utils/tradeConstants');

/**
 * Coloca la primera orden de VENTA (Apertura de Short).
 */
async function placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState) {
    const { purchaseUsdt } = config.short;
    const SYMBOL = config.symbol;
    const amountNominal = parseFloat(purchaseUsdt);
    const amountRealCost = amountNominal * (1 + BUY_FEE_PERCENT);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[S] ❌ Error: Monto $${amountNominal} inferior al mínimo de BitMart.`, 'error');
        await updateBotState('NO_COVERAGE', 'short'); 
        return;
    }

    const currentSBalance = parseFloat(botState.sbalance || 0);
    const newSBalance = currentSBalance - amountRealCost;

    log(`[S] 🚀 Abriendo SHORT: Venta a mercado por ${amountNominal} USDT...`, 'info'); 

    try {
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', amountNominal); 

        if (orderResult && orderResult.order_id) {
            // ACTUALIZACIÓN ATÓMICA: Deducción y Bloqueo
            await updateGeneralBotState({
                sbalance: newSBalance,
                sStateData: {
                    ...botState.sStateData,
                    lastOrder: {
                        order_id: orderResult.order_id,
                        side: 'sell',
                        usdt_amount: amountNominal,
                        usdt_cost_real: amountRealCost,
                    }
                }
            });
            log(`✅ [S] Orden inicial registrada (ID: ${orderResult.order_id}). SBalance: ${newSBalance.toFixed(2)}`, 'success');
        }
    } catch (error) {
        log(`[S] ❌ Error crítico al abrir Short: ${error.message}`, 'error');
        throw error; 
    }
}

/**
 * Coloca orden de VENTA adicional (Cobertura/DCA de Short hacia arriba).
 */
async function placeCoverageShortOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState) { 
    const SYMBOL = botState.config.symbol;
    const amountRealCost = usdtAmount * (1 + BUY_FEE_PERCENT);
    const newSBalance = (parseFloat(botState.sbalance || 0)) - amountRealCost;

    if (newSBalance < 0) {
        log(`[S] ⚠️ Fondos insuficientes para cobertura Short. SBalance: ${botState.sbalance.toFixed(2)}`, 'error');
        await updateBotState('NO_COVERAGE', 'short'); 
        return;
    }

    log(`[S] 📈 Ejecutando COBERTURA SHORT: ${usdtAmount.toFixed(2)} USDT...`, 'warning');
    
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', usdtAmount); 

        if (order && order.order_id) {
            await updateGeneralBotState({
                sbalance: newSBalance,
                sStateData: {
                    ...botState.sStateData,
                    lastOrder: {
                        order_id: order.order_id,
                        side: 'sell',
                        usdt_amount: usdtAmount,
                        usdt_cost_real: amountRealCost,
                    }
                }
            });
            log(`✅ [S] Cobertura Short colocada (ID: ${order.order_id}).`, 'success');
        }
    } catch (error) {
        log(`[S] ❌ Error en cobertura Short: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Coloca la orden de COMPRA (Cierre de Short / Take Profit abajo).
 */
async function placeShortBuyOrder(config, botState, btcAmount, log, updateSStateData) { 
    const SYMBOL = config.symbol;
    log(`[S] 💰 Ejecutando RECOMPRA (Take Profit): ${btcAmount.toFixed(8)} BTC...`, 'info');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', btcAmount); 

        if (order && order.order_id) {
            // BLOQUEO ATÓMICO: Registramos la orden para consolidación
            await updateSStateData({
                lastOrder: {
                    order_id: order.order_id,
                    size: btcAmount,
                    side: 'buy'
                }
            });
            log(`✅ [S] Recompra enviada (ID: ${order.order_id}).`, 'success');
        }
    } catch (error) { 
        log(`[S] ❌ Error en orden de recompra: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Cancela órdenes activas de Short.
 */
async function cancelActiveShortOrder(botState, log, updateSStateData) {
    const lastOrder = botState.sStateData.lastOrder;
    if (!lastOrder?.order_id) return;

    const SYMBOL = botState.config.symbol;
    
    try {
        log(`[S] 🛑 Cancelando orden Short ${lastOrder.order_id}...`, 'warning');
        const result = await bitmartService.cancelOrder(SYMBOL, lastOrder.order_id); 
        
        if (result?.code === 1000 || result?.message?.includes('already filled')) {
            await updateSStateData({ lastOrder: null });
            log(`✅ [S] Orden Short limpiada.`, 'success');
        }
    } catch (error) {
        log(`[S] ❌ Error al cancelar orden Short: ${error.message}`, 'error');
    }
}

module.exports = {
    placeFirstShortOrder,
    placeCoverageShortOrder,
    placeShortBuyOrder,
    cancelActiveShortOrder
};