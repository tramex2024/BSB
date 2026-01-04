// BSB/server/src/au/managers/longOrderManager.js

const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART, BUY_FEE_PERCENT } = require('../utils/tradeConstants');

/**
 * PRIMERA COMPRA: Inicia la cadena exponencial.
 */
async function placeFirstBuyOrder(config, botState, log, updateBotState, updateGeneralBotState) {
    const { purchaseUsdt } = config.long;
    const SYMBOL = config.symbol;
    const amountNominal = parseFloat(purchaseUsdt);
    
    // El costo real incluye la comisión para no dejar saldos huérfanos en el balance del bot
    const amountRealCost = amountNominal * (1 + BUY_FEE_PERCENT);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`❌ [L-FIRST] Monto $${amountNominal} es inferior al mínimo de BitMart ($5).`, 'error');
        await updateBotState('NO_COVERAGE', 'long'); 
        return;
    }

    const currentLBalance = parseFloat(botState.lbalance || 0);
    
    log(`🚀 [L-FIRST] Comprando base de ${amountNominal} USDT para iniciar ciclo...`, 'info'); 

    try {
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', amountNominal); 

        if (orderResult && orderResult.order_id) {
            const newLBalance = currentLBalance - amountRealCost;
            
            // REGISTRO ATÓMICO: Establecemos la base de la pirámide exponencial
            await updateGeneralBotState({
                lbalance: newLBalance,
                lStateData: {
                    ...botState.lStateData,
                    lastOrder: {
                        order_id: orderResult.order_id,
                        side: 'buy',
                        usdt_amount: amountNominal, // Semilla para la siguiente exponencial
                        usdt_cost_real: amountRealCost,
                        timestamp: new Date()
                    }
                }
            });
            log(`✅ [L-FIRST] Orden ID: ${orderResult.order_id}. Balance Bot: ${newLBalance.toFixed(2)}`, 'success');
        }
    } catch (error) {
        log(`❌ [L-FIRST] Error de red/API: ${error.message}. El bot reintentará en el sig. tick.`, 'error');
        // No lanzamos throw para que el bot no se detenga, la autonomía es prioridad
    }
}

/**
 * COBERTURA (DCA) EXPONENCIAL: Ejecuta el siguiente salto de la serie.
 */
async function placeCoverageBuyOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState) { 
    const SYMBOL = botState.config.symbol;
    const amountRealCost = usdtAmount * (1 + BUY_FEE_PERCENT);
    const currentBalance = parseFloat(botState.lbalance || 0);

    log(`📉 [L-DCA] Disparando orden exponencial de ${usdtAmount.toFixed(2)} USDT...`, 'warning');
    
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtAmount); 

        if (order && order.order_id) {
            const newLBalance = currentBalance - amountRealCost;

            await updateGeneralBotState({
                lbalance: newLBalance,
                lStateData: {
                    ...botState.lStateData,
                    lastOrder: {
                        order_id: order.order_id,
                        side: 'buy',
                        usdt_amount: usdtAmount, // Nueva semilla actualizada
                        usdt_cost_real: amountRealCost,
                        timestamp: new Date()
                    }
                }
            });
            log(`✅ [L-DCA] Orden ${order.order_id} colocada. Nuevo balance bloqueado.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-DCA] Error al promediar: ${error.message}`, 'error');
    }
}

/**
 * VENTA (Take Profit): Liquida la posición acumulada exponencialmente.
 */
async function placeSellOrder(config, botState, sellAmount, log, updateLStateData) { 
    const SYMBOL = config.symbol;
    log(`💰 [L-SELL] Liquidando posición total de ${sellAmount.toFixed(8)} BTC...`, 'info');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', sellAmount); 

        if (order && order.order_id) {
            // Bloqueamos con lastOrder para evitar doble venta si la API tarda en responder
            await updateLStateData({
                lastOrder: {
                    order_id: order.order_id,
                    size: sellAmount,
                    side: 'sell',
                    timestamp: new Date()
                }
            });
            log(`✅ [L-SELL] Orden enviada (ID: ${order.order_id}). Esperando consolidación...`, 'success');
        }
    } catch (error) { 
        log(`❌ [L-SELL] Error en liquidación: ${error.message}`, 'error');
    }
}

/**
 * CANCELACIÓN DE SEGURIDAD.
 */
async function cancelActiveLongOrder(botState, log, updateLStateData) {
    const lastOrder = botState.lStateData.lastOrder;
    if (!lastOrder?.order_id) return;

    const SYMBOL = botState.config.symbol;
    
    try {
        log(`🛑 [L-CANCEL] Limpiando orden ${lastOrder.order_id}...`, 'warning');
        const result = await bitmartService.cancelOrder(SYMBOL, lastOrder.order_id); 
        
        // Si el código es 1000 (éxito) o si ya se llenó, liberamos el lastOrder
        if (result?.code === 1000 || result?.message?.includes('already filled')) {
            await updateLStateData({ lastOrder: null });
            log(`✅ [L-CANCEL] Sistema desbloqueado.`, 'success');
        }
    } catch (error) {
        log(`❌ [L-CANCEL] No se pudo cancelar: ${error.message}`, 'error');
    }
}

module.exports = {
    placeFirstBuyOrder,
    placeCoverageBuyOrder,
    placeSellOrder,
    cancelActiveLongOrder
};