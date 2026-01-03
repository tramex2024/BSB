// BSB/server/src/au/managers/shortOrderManager.js (Espejo de longOrderManager.js)

const Autobot = require('../../../models/Autobot');
const bitmartService = require('../../../services/bitmartService');
// Usamos las mismas constantes, ya que BitMart aplica las mismas reglas para vender
const { MIN_USDT_VALUE_FOR_BITMART, BUY_FEE_PERCENT } = require('../utils/tradeConstants');

/**
 * Coloca la primera orden de VENTA (Apertura de Short).
 */
async function placeFirstShortOrder(config, botState, log, updateBotState, updateGeneralBotState) {
    const { purchaseUsdt } = config.short;
    const SYMBOL = config.symbol;
    const amountNominal = parseFloat(purchaseUsdt);
    
    // En Short, al vender, también calculamos el costo real con comisión
    const amountRealCost = amountNominal * (1 + BUY_FEE_PERCENT);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[S] Error: Cantidad menor al mínimo ($${MIN_USDT_VALUE_FOR_BITMART}).`, 'error');
        await updateBotState('NO_COVERAGE', 'short'); 
        return;
    }
    
    const currentSBalance = parseFloat(botState.sbalance || 0);
    const newSBalance = currentSBalance - amountRealCost;

    log(`[S] Abriendo Short: Venta a mercado por ${amountNominal.toFixed(2)} USDT (Costo real: ${amountRealCost.toFixed(2)} USDT).`, 'info'); 

    try {
        // ACCIÓN: 'sell' para abrir el Short
        const orderResult = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', amountNominal); 

        const orderId = orderResult.order_id;
        log(`[S] Orden inicial colocada. ID: ${orderId}. Bloqueando sStateData...`, 'info');

        // ACTUALIZACIÓN ATÓMICA SHORT
        await Autobot.findOneAndUpdate({}, {
            $set: {
                'sbalance': newSBalance,
                'sStateData.lastOrder': {
                    order_id: orderId,
                    side: 'sell', // Identifica que es apertura/cobertura de short
                    usdt_amount: amountNominal,
                    usdt_cost_real: amountRealCost,
                }
            }
        });

        log(`[S] Balance asignado Short reducido. Nuevo balance: ${newSBalance.toFixed(2)} USDT.`, 'info');
        
    } catch (error) {
        log(`[S] Error CRÍTICO al abrir Short: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Coloca orden de VENTA adicional (Cobertura/DCA de Short).
 */
async function placeCoverageShortOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState) { 
    const SYMBOL = botState.config.symbol;
    const currentSBalance = parseFloat(botState.sbalance || 0);
    const amountNominal = usdtAmount;
    const amountRealCost = amountNominal * (1 + BUY_FEE_PERCENT);

    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`[S] Cantidad de cobertura insuficiente para BitMart.`, 'error');
        await updateBotState('NO_COVERAGE', 'short'); 
        return;
    }
    
    const newSBalance = currentSBalance - amountRealCost; 

    if (newSBalance < 0) {
        log(`[S] Capital insuficiente para cobertura Short.`, 'error');
        await updateBotState('NO_COVERAGE', 'short'); 
        return;
    }
    
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', amountNominal); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id; 

            await Autobot.findOneAndUpdate({}, { 
                $set: {
                    'sbalance': newSBalance,
                    'sStateData.lastOrder': {
                        order_id: currentOrderId,
                        side: 'sell',
                        usdt_amount: amountNominal,
                        usdt_cost_real: amountRealCost, 
                    },
                }
            }, { new: true });
            
            log(`[S] Cobertura Short colocada. ID: ${currentOrderId}.`, 'success');
        }
    } catch (error) {
        log(`[S] Error de API en cobertura: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Coloca orden de COMPRA (Cierre de Short/Take Profit).
 */
async function placeShortBuyOrder(config, botState, btcAmount, log) { 
    const SYMBOL = config.symbol;
    const amountToBuy = parseFloat(btcAmount);

    log(`[S] Cerrando Short: Recomprando ${btcAmount.toFixed(8)} BTC a mercado.`, 'info');
    try {
        // ACCIÓN: 'buy' para cerrar la deuda del Short
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', amountToBuy); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            
            const buyLastOrder = {
                order_id: currentOrderId,
                size: btcAmount,
                side: 'buy', // Identifica cierre de Short
            };
            
            await Autobot.findOneAndUpdate({}, { 
                $set: { 'sStateData.lastOrder': buyLastOrder } 
            });

            log(`[S] Orden de cierre colocada. ID: ${currentOrderId}. Esperando consolidación...`, 'success');
        }
    } catch (error) { 
        log(`[S] Error de API al cerrar Short: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Cancela orden activa de Short.
 */
async function cancelActiveShortOrder(botState, log) {
    if (!botState.sStateData.lastOrder || !botState.sStateData.lastOrder.order_id) return;

    const SYMBOL = botState.config.symbol;
    const orderId = botState.sStateData.lastOrder.order_id;
    
    try {
        const result = await bitmartService.cancelOrder(SYMBOL, orderId); 
        if (result && result.code === 1000) {
            log(`[S] Orden Short ${orderId} cancelada.`, 'success');
        }
        await Autobot.findOneAndUpdate({}, { $set: { 'sStateData.lastOrder': null } });
    } catch (error) {
        log(`[S] Error al cancelar orden Short: ${error.message}`, 'error');
    }
}

module.exports = {
    placeFirstShortOrder,
    placeCoverageShortOrder,
    placeShortBuyOrder,
    cancelActiveShortOrder
};