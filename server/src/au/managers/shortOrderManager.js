// BSB/server/src/au/managers/shortOrderManager.js

const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART, BUY_FEE_PERCENT } = require('../utils/tradeConstants');

/**
 * APERTURA DE SHORT: Inicia la deuda exponencial vendiendo el activo.
 */
async function placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState) {
    const { purchaseUsdt } = config.short;
    const SYMBOL = config.symbol;
    const amountNominal = parseFloat(purchaseUsdt);
    
    // El costo real incluye la comisión para que el balance del bot sea exacto
    const amountRealCost = amountNominal * (1 + BUY_FEE_PERCENT);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[S-FIRST] ❌ Error: Monto $${amountNominal} inferior al mínimo de BitMart.`, 'error');
        await updateBotState('NO_COVERAGE', 'short'); 
        return;
    }

    const currentSBalance = parseFloat(botState.sbalance || 0);

    log(`🚀 [S-FIRST] Abriendo Short con ${amountNominal} USDT...`, 'info'); 

    try {
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', amountNominal); 

        if (orderResult && orderResult.order_id) {
            const newSBalance = currentSBalance - amountRealCost;
            
            // REGISTRO ATÓMICO: Guardamos la base para el crecimiento exponencial
            await updateGeneralBotState({
                sbalance: newSBalance,
                sStateData: {
                    ...botState.sStateData,
                    lastOrder: {
                        order_id: orderResult.order_id,
                        side: 'sell',
                        usdt_amount: amountNominal, // Base para la siguiente multiplicación
                        usdt_cost_real: amountRealCost,
                        timestamp: new Date()
                    }
                }
            });
            log(`✅ [S-FIRST] Éxito. ID: ${orderResult.order_id}. Balance Short: ${newSBalance.toFixed(2)}`, 'success');
        }
    } catch (error) {
        log(`❌ [S-FIRST] Error de API al abrir: ${error.message}. Reintentando en sig. tick...`, 'error');
        // No lanzamos throw para mantener autonomía
    }
}

/**
 * COBERTURA SHORT (DCA): Venta exponencial hacia arriba.
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
            
            await updateGeneralBotState({
                sbalance: newSBalance,
                sStateData: {
                    ...botState.sStateData,
                    lastOrder: {
                        order_id: order.order_id,
                        side: 'sell',
                        usdt_amount: usdtAmount, // Actualizamos la semilla exponencial
                        usdt_cost_real: amountRealCost,
                        timestamp: new Date()
                    }
                }
            });
            log(`✅ [S-DCA] Orden ${order.order_id} registrada. PPC en proceso de subida.`, 'success');
        }
    } catch (error) {
        log(`❌ [S-DCA] Error en ejecución: ${error.message}`, 'error');
    }
}

/**
 * RECOMPRA (Take Profit): Cierre de ciclo Short.
 */
async function placeShortBuyOrder(config, botState, btcAmount, log, updateSStateData) { 
    const SYMBOL = config.symbol;
    log(`💰 [S-PROFIT] Recomprando ${btcAmount.toFixed(8)} BTC para cerrar ciclo...`, 'info');

    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', btcAmount); 

        if (order && order.order_id) {
            await updateSStateData({
                lastOrder: {
                    order_id: order.order_id,
                    size: btcAmount,
                    side: 'buy',
                    timestamp: new Date()
                }
            });
            log(`✅ [S-PROFIT] Recompra enviada (ID: ${order.order_id}).`, 'success');
        }
    } catch (error) { 
        log(`❌ [S-PROFIT] Error en recompra: ${error.message}`, 'error');
    }
}

/**
 * LIMPIEZA DE ÓRDENES HUÉRFANAS.
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
            log(`✅ [S-CANCEL] Sistema sincronizado y desbloqueado.`, 'success');
        }
    } catch (error) {
        log(`❌ [S-CANCEL] Error: ${error.message}`, 'error');
    }
}

module.exports = {
    placeFirstShortOrder,
    placeCoverageShortOrder,
    placeShortBuyOrder,
    cancelActiveShortOrder
};