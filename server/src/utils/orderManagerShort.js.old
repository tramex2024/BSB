// BSB/server/src/utils/orderManagerShort.js

const Autobot = require('../../models/Autobot');
const bitmartService = require('../../services/bitmartService'); 

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_BTC_SIZE_FOR_BITMART = 0.0001; // Mínimo de BTC para operar.

// =========================================================================
// === [ LÓGICA SHORT: Venta Inicial, Cobertura (Compra), Cierre (Compra) ] ==
// =========================================================================

/**
 * Coloca la primera orden de VENTA (o inicial Short) y realiza un bloqueo atómico.
 * Esta función inicia la posición Short.
 * @param {object} botState - Estado actual del bot.
 * @param {number} amount - Cantidad de BTC a vender (config.short.sellBtc).
 * @param {function} log - Función de logging.
 * @param {function} updateGeneralBotState - Función para actualizar campos generales (sbalance, sstate).
 */
async function placeInitialSellOrder(botState, amount, log, updateGeneralBotState) {
    const SSTATE = 'short';
    
    // --- 1. BLOQUEO ATÓMICO Y TRANSICIÓN DE ESTADO ---
    // Usamos $set para cambiar el estado a BUYING (ya que el Short usa BUYING para el ciclo activo)
    const initialCheck = await Autobot.findOneAndUpdate(
        { sstate: 'RUNNING' }, 
        { $set: { sstate: 'BUYING' } }, 
        { new: true } 
    );

    if (!initialCheck) {
        log('[SHORT] Advertencia: Intento de doble venta (inicial) bloqueado. El estado ya ha cambiado a BUYING.', 'warning');
        return; 
    }
    
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;

    if (amount < MIN_BTC_SIZE_FOR_BITMART) {
        log(`[SHORT] Error: La cantidad de venta (BTC) es menor al mínimo de BitMart (${MIN_BTC_SIZE_FOR_BITMART}). Cancelando.`, 'error');
        await updateGeneralBotState({ sstate: 'RUNNING' }); // Revertir el estado a RUNNING
        return;
    }

    log(`[SHORT] Colocando la primera orden de VENTA a mercado por ${amount.toFixed(8)} BTC.`, 'info');

    try {
        const orderResult = await bitmartService.placeOrder(
            botState.creds,
            SYMBOL, 
            'sell', // VENTA
            'market', 
            amount, 
            null 
        );
        
        if (!orderResult || !orderResult.order_id) {
            log(`[SHORT] Error al recibir ID de la orden de BitMart. Resultado: ${JSON.stringify(orderResult)}`, 'error');
            await updateGeneralBotState({ sstate: 'RUNNING' }); 
            return;
        }

        const orderId = orderResult.order_id;
        log(`[SHORT] Orden de VENTA colocada. ID: ${orderId}.`, 'info');

        // --- 3. ACTUALIZACIÓN DE ESTADO Y BALANCE ---

        const currentBotState = initialCheck; 
        const currentSBalance = parseFloat(currentBotState.sbalance || 0);
        
        // Descontar la cantidad de venta del SBalance (BTC).
        const newSBalance = currentSBalance - amount;

        // Actualizar sbalance, lastOrder Y AC (monto cubierto)
        await Autobot.findOneAndUpdate({}, {
            $set: {
                'sbalance': newSBalance,
                'sStateData.lastOrder': {
                    order_id: orderId,
                    side: 'sell',
                    btc_amount: amount,
                }
            },
            $inc: {
                'sStateData.ac': amount // El monto AC (Amount Covered) inicia aquí
            }
        });

        log(`[SHORT] SBalance (BTC) reducido en ${amount.toFixed(8)} BTC. Nuevo balance: ${newSBalance.toFixed(8)} BTC.`, 'info');
        
    } catch (error) {
        log(`[SHORT] Error CRÍTICO al colocar la primera orden de VENTA: ${error.message}`, 'error');
        await updateGeneralBotState({ sstate: 'RUNNING' }); 
    }
}

/**
 * Coloca una orden de COMPRA de cobertura (DCA Short) y actualiza el capital.
 * @param {object} botState - Estado actual del bot.
 * @param {number} btcAmount - Cantidad de BTC a recomprar (requerido para esta orden).
 * @param {function} log - Función de logging.
 * @param {function} updateGeneralBotState - Función para actualizar el estado general.
 */
async function placeCoverageBuyOrderShort(botState, btcAmount, log, updateGeneralBotState) { 
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    const currentSBalance = parseFloat(botState.sbalance || 0);

    // --- CÁLCULO DE LA PRÓXIMA COBERTURA (Progresión Geométrica) ---
    const sizeVariance = botState.config.short.size_var / 100;
    const nextOrderAmount = btcAmount * (1 + sizeVariance);

    // --- PRE-DEDUCCIÓN DEL BALANCE ---
    const newSBalance = currentSBalance - btcAmount;
    if (newSBalance < 0) {
        log(`[SHORT] Error: Capital (BTC) insuficiente para la orden de cobertura de ${btcAmount.toFixed(8)} BTC.`, 'error');
        return; 
    }
    await updateGeneralBotState({ sbalance: newSBalance });
    log(`[SHORT] SBalance (BTC) reducido en ${btcAmount.toFixed(8)} BTC para la orden de cobertura. Nuevo balance: ${newSBalance.toFixed(8)} BTC.`, 'info');


    log(`[SHORT] Colocando orden de COMPRA (cobertura) a MERCADO por ${btcAmount.toFixed(8)} BTC.`, 'info');
    
    try {
        const order = await bitmartService.placeOrder(botState.creds, SYMBOL, 'buy', 'market', btcAmount); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;  

            // --- 2. ACTUALIZACIÓN ATÓMICA DE ESTADO PENDIENTE ---
            // sStateData.lastOrder se actualiza. SBuying.js se encargará de consolidar.
            const updateResult = await Autobot.findOneAndUpdate({}, { 
                $set: {
                    'sStateData.lastOrder': {
                        order_id: currentOrderId,
                        side: 'buy',
                        btc_amount: btcAmount,
                    },
                    'sStateData.requiredCoverageAmount': nextOrderAmount 
                }
            }, { new: true });
            
            if (updateResult) {
                log(`[SHORT] Orden de cobertura colocada. ID: ${currentOrderId}. Próximo monto de cobertura: ${nextOrderAmount.toFixed(8)} BTC.`, 'success');
            } else {
                log(`[SHORT] Advertencia: Orden colocada (${currentOrderId}), pero no se pudo actualizar la DB. Revisar.`, 'error');
            }

        } else {
            log(`[SHORT] Error al colocar la orden de cobertura. Respuesta API: ${JSON.stringify(order)}`, 'error');
            
            // Revertir el balance si la orden nunca se colocó.
            const finalSBalance = newSBalance + btcAmount;
            await updateGeneralBotState({ sbalance: finalSBalance });
            log(`[SHORT] Se revierte ${btcAmount.toFixed(8)} BTC al balance (error de colocación).`, 'info');
        }
    } catch (error) {
        log(`[SHORT] Error de API al colocar la orden de cobertura: ${error.message}`, 'error');
        // Revertir el balance en caso de error de API
        const finalSBalance = newSBalance + btcAmount;
        await updateGeneralBotState({ sbalance: finalSBalance });
        log(`[SHORT] Se revierte ${btcAmount.toFixed(8)} BTC al balance (error de API).`, 'info');
    }
}

/**
 * Coloca una orden de COMPRA a mercado para CERRAR el ciclo Short (Trailing Stop o TP).
 * @param {object} config - Configuración del bot.
 * @param {object} creds - Credenciales del bot.
 * @param {number} buyAmount - Cantidad de la moneda base a recomprar (e.g., BTC).
 * @param {function} log - Función de logging.
 * @param {object} botState - Estado actual del bot.
 */
async function placeBuyOrder(config, creds, buyAmount, log, botState) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    log(`[SHORT] Colocando orden de COMPRA (cierre) a mercado por ${buyAmount.toFixed(8)} BTC.`, 'info');
    try {
        const order = await bitmartService.placeOrder(creds, SYMBOL, 'buy', 'market', buyAmount); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            log(`[SHORT] Orden de compra (cierre) colocada. ID: ${currentOrderId}. Monitoreo en SSelling...`, 'success');
            
            // 1. Crear el objeto lastOrder de compra pendiente
            const buyLastOrder = {
                order_id: currentOrderId,
                price: botState.sStateData.ppc, 
                size: buyAmount,
                side: 'buy',
                state: 'pending_fill'
            };
            
            // 2. Persistir el lastOrder de forma atómica
            await Autobot.findOneAndUpdate({}, { 
                $set: { 'sStateData.lastOrder': buyLastOrder } 
            });

        } else {
            log(`[SHORT] Error al colocar la orden de compra (cierre). Respuesta API: ${JSON.stringify(order)}`, 'error');
        }
    } catch (error) {
        log(`[SHORT] Error de API al colocar la orden de compra (cierre): ${error.message}`, 'error');
    }
}


/**
 * Cancela la última orden activa del bot (Solo Short).
 * @param {object} botState - Estado actual del bot.
 * @param {function} log - Función de logging inyectada.
 */
async function cancelActiveOrdersShort(botState, log) {
    if (!botState.sStateData.lastOrder || !botState.sStateData.lastOrder.order_id) {
        log("[SHORT] No hay una orden para cancelar registrada.", 'info');
        return;
    }

    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    const orderId = botState.sStateData.lastOrder.order_id;
    
    try {
        log(`[SHORT] Intentando cancelar orden ID: ${orderId}...`, 'warning');
        
        const result = await bitmartService.cancelOrder(botState.creds, SYMBOL, orderId); 
        
        if (result && result.code === 1000) {
            log(`[SHORT] Orden ${orderId} cancelada exitosamente.`, 'success');
        } else {
            log(`[SHORT] No se pudo cancelar la orden ${orderId}. Razón: ${JSON.stringify(result)}`, 'error');
        }
        
        // Limpiar el lastOrder del estado
        await Autobot.findOneAndUpdate({}, { 'sStateData.lastOrder': null });

    } catch (error) {
        log(`[SHORT] Error de API al intentar cancelar la orden ${orderId}: ${error.message}`, 'error');
    }
}

module.exports = {
    placeInitialSellOrder,
    placeCoverageBuyOrderShort,
    placeBuyOrder, // Cierre Short
    cancelActiveOrdersShort,
    MIN_BTC_SIZE_FOR_BITMART
};