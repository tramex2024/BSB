// BSB/server/src/au/managers/longOrderManager.js

const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART, BUY_FEE_PERCENT } = require('../utils/tradeConstants');

/**
 * Coloca la primera orden de compra de un ciclo.
 */
async function placeFirstBuyOrder(config, botState, log, updateBotState, updateGeneralBotState) {
    const { purchaseUsdt } = config.long;
    const SYMBOL = config.symbol;
    const amountNominal = parseFloat(purchaseUsdt);
    const amountRealCost = amountNominal * (1 + BUY_FEE_PERCENT);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`❌ Error: Monto $${amountNominal} inferior al mínimo de BitMart.`, 'error');
        await updateBotState('NO_COVERAGE', 'long'); 
        return;
    }

    const currentLBalance = parseFloat(botState.lbalance || 0);
    const newLBalance = currentLBalance - amountRealCost;

    log(`🚀 Ejecutando PRIMERA COMPRA: ${amountNominal} USDT...`, 'info'); 

    try {
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', amountNominal); 

        if (orderResult && orderResult.order_id) {
            // BLOQUEO Y DEDUCCIÓN ATÓMICA
            await updateGeneralBotState({
                lbalance: newLBalance,
                lStateData: {
                    ...botState.lStateData,
                    lastOrder: {
                        order_id: orderResult.order_id,
                        side: 'buy',
                        usdt_amount: amountNominal,
                        usdt_cost_real: amountRealCost,
                    }
                }
            });
            log(`✅ Primera orden registrada (ID: ${orderResult.order_id}). LBalance: ${newLBalance.toFixed(2)}`, 'success');
        }
    } catch (error) {
        log(`❌ Error crítico en primera compra: ${error.message}`, 'error');
        throw error; 
    }
}

/**
 * Coloca una orden de COBERTURA (DCA).
 */
async function placeCoverageBuyOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState) { 
    const SYMBOL = botState.config.symbol;
    const amountRealCost = usdtAmount * (1 + BUY_FEE_PERCENT);
    const newLBalance = (parseFloat(botState.lbalance || 0)) - amountRealCost;

    if (newLBalance < 0) {
        log(`⚠️ Fondos insuficientes para cobertura. Faltan ${(newLBalance * -1).toFixed(2)} USDT.`, 'error');
        await updateBotState('NO_COVERAGE', 'long'); 
        return;
    }

    log(`📉 Ejecutando COBERTURA (DCA): ${usdtAmount.toFixed(2)} USDT...`, 'warning');
    
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtAmount); 

        if (order && order.order_id) {
            // ACTUALIZACIÓN ATÓMICA
            await updateGeneralBotState({
                lbalance: newLBalance,
                lStateData: {
                    ...botState.lStateData,
                    lastOrder: {
                        order_id: order.order_id,
                        side: 'buy',
                        usdt_amount: usdtAmount,
                        usdt_cost_real: amountRealCost,
                    }
                }
            });
            log(`✅ Cobertura colocada (ID: ${order.order_id}).`, 'success');
        }
    } catch (error) {
        log(`❌ Error en orden de cobertura: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Coloca la orden de VENTA (Take Profit).
 */
async function placeSellOrder(config, botState, sellAmount, log, updateLStateData) { 
    const SYMBOL = config.symbol;
    log(`💰 Ejecutando VENTA (Take Profit): ${sellAmount.toFixed(8)} BTC...`, 'info');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', sellAmount); 

        if (order && order.order_id) {
            // BLOQUEO ATÓMICO: Registramos la orden para que el Consolidator la vigile
            await updateLStateData({
                lastOrder: {
                    order_id: order.order_id,
                    size: sellAmount,
                    side: 'sell'
                }
            });
            log(`✅ Venta enviada (ID: ${order.order_id}). Esperando confirmación...`, 'success');
        }
    } catch (error) { 
        log(`❌ Error en orden de venta: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Cancela órdenes huérfanas.
 */
async function cancelActiveLongOrder(botState, log, updateLStateData) {
    const lastOrder = botState.lStateData.lastOrder;
    if (!lastOrder?.order_id) return;

    const SYMBOL = botState.config.symbol;
    
    try {
        log(`🛑 Cancelando orden ${lastOrder.order_id}...`, 'warning');
        const result = await bitmartService.cancelOrder(SYMBOL, lastOrder.order_id); 
        
        if (result?.code === 1000 || result?.message?.includes('already filled')) {
            await updateLStateData({ lastOrder: null });
            log(`✅ Orden limpiada del sistema.`, 'success');
        }
    } catch (error) {
        log(`❌ Error al cancelar: ${error.message}`, 'error');
    }
}

module.exports = {
    placeFirstBuyOrder,
    placeCoverageBuyOrder,
    placeSellOrder,
    cancelActiveLongOrder
};