// BSB/server/src/utils/orderManager.js (CORREGIDO Y OPTIMIZADO)

const Autobot = require('../../models/Autobot');
// 🛑 CORRECCIÓN: Se asume que handleSuccessfulSell se pasa como dependencia (desde LSelling.js)
const bitmartService = require('../../services/bitmartService'); 
const { parseNumber } = require('../../utils/helpers'); // ✅ Importación de helper

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;


/**
 * Coloca la primera orden de compra (o inicial).
 */
async function placeFirstBuyOrder(config, creds, log, currentBotState, updateBotState, updateGeneralBotState) {
    
    const { purchaseUsdt } = config.long;
    const SYMBOL = config.symbol || TRADE_SYMBOL;
    const amount = parseNumber(purchaseUsdt);
    
    // A. Validación de errores
    if (amount < MIN_USDT_VALUE_FOR_BITMART) {
        log(`Error: La cantidad de compra es menor al mínimo de BitMart ($${MIN_USDT_VALUE_FOR_BITMART}). Transicionando a NO_COVERAGE.`, 'error');
        await updateBotState('NO_COVERAGE', 'long'); 
        return;
    }

    const currentLBalance = parseNumber(currentBotState.lbalance || 0);
    const newLBalance = currentLBalance - amount;

    if (newLBalance < 0) {
        log(`Error: Capital insuficiente para la orden inicial de ${amount.toFixed(2)} USDT. Transicionando a NO_COVERAGE.`, 'error');
        await updateBotState('NO_COVERAGE', 'long'); 
        return; 
    }

    log(`Colocando la primera orden de compra a mercado por ${amount.toFixed(2)} USDT.`, 'info'); 

    let orderId = null;

    try {
        // --- PRE-DEDUCCIÓN DEL BALANCE (CRÍTICO) ---
        // Usamos updateGeneralBotState para garantizar el scope del lbalance
        await updateGeneralBotState({ lbalance: newLBalance });
        log(`LBalance asignado reducido en ${amount.toFixed(2)} USDT antes de la orden.`, 'info');

        const orderResult = await bitmartService.placeOrder(
            creds, SYMBOL, 'BUY', 'market', amount, null 
        ); 

        orderId = orderResult.order_id;

        // --- ACTUALIZACIÓN DE ESTADO LAST ORDER (CRÍTICO) ---
        await Autobot.findOneAndUpdate({}, {
            $set: {
                'lStateData.lastOrder': {
                    order_id: orderId,
                    side: 'BUY',
                    usdt_amount: amount,
                    state: 'pending_fill'
                },
            },
        });
        log(`Orden de compra colocada. ID: ${orderId}. Monitoreo delegado a LBuying.js.`, 'info');
        
    } catch (error) {
        log(`Error CRÍTICO al colocar la primera orden: ${error.message}`, 'error');
        
        // 🎯 REVERSIÓN CRÍTICA: Revertir el balance pre-deducido
        if (!orderId) {
            await updateGeneralBotState({ lbalance: currentLBalance }); // Revertir al balance antes de la deducción
            log(`Se revierte ${amount.toFixed(2)} USDT al balance (error de colocación/API).`, 'info');
        } 
        // El estado se mantiene en BUYING y la próxima ejecución reintentará la compra (Sección 3C de LBuying.js).
    }
}

/**
 * Coloca una orden de compra de cobertura (a Mercado) y actualiza el capital para la ejecución.
 */
async function placeCoverageBuyOrder(botState, creds, usdtAmount, log, updateBotState, updateGeneralBotState) { 
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    const amount = parseNumber(usdtAmount);
    const currentLBalance = parseNumber(botState.lbalance || 0);
    
    // Validación mínima
    if (amount < MIN_USDT_VALUE_FOR_BITMART) {
        log(`Error: Cobertura menor al mínimo. Transicionando a NO_COVERAGE.`, 'error');
        await updateBotState('NO_COVERAGE', 'long'); 
        return;
    }

    // --- PRE-DEDUCCIÓN DEL BALANCE ---
    const newLBalance = currentLBalance - amount;
    if (newLBalance < 0) {
        log(`Error: Capital insuficiente para la orden de cobertura de ${amount.toFixed(2)} USDT. Transicionando a NO_COVERAGE.`, 'error');
        await updateBotState('NO_COVERAGE', 'long'); 
        return; 
    }
    
    // Deducción de lbalance se hace ANTES de la colocación (CRÍTICO)
    await updateGeneralBotState({ lbalance: newLBalance });
    log(`LBalance asignado reducido en ${amount.toFixed(2)} USDT para la orden de cobertura.`, 'info');

    log(`Colocando orden de cobertura a MERCADO por ${amount.toFixed(2)} USDT.`, 'info');
    
    let orderId = null;

    try {
        const order = await bitmartService.placeOrder(creds, SYMBOL, 'BUY', 'market', amount); 
        
        if (order && order.order_id) {
            orderId = order.order_id; 

            // --- ACTUALIZACIÓN ATÓMICA DE ESTADO PENDIENTE ---
            await Autobot.findOneAndUpdate({}, { 
                $set: {
                    'lStateData.lastOrder': {
                        order_id: orderId,
                        side: 'BUY',
                        usdt_amount: amount,
                        state: 'pending_fill'
                    },
                }
            });
            
            log(`Orden de cobertura colocada. ID: ${orderId}.`, 'success');
        } else {
            log(`Error al colocar la orden de cobertura. Revertiendo balance.`, 'error');
            // Revertir el balance pre-deducido si la orden nunca se colocó.
            await updateGeneralBotState({ lbalance: currentLBalance }); // Revertir al balance antes de la deducción
            log(`Se revierte ${amount.toFixed(2)} USDT al balance (error de colocación).`, 'info');
        }
    } catch (error) {
        log(`Error de API al colocar la orden de cobertura: ${error.message}`, 'error');
        
        // Revertir el balance pre-deducido en caso de error de API
        await updateGeneralBotState({ lbalance: currentLBalance }); // Revertir al balance antes de la deducción
        log(`Se revierte ${amount.toFixed(2)} USDT al balance (error de API).`, 'info');
    }
    // En caso de fallo, LBuying.js reevaluará el estado, detectará la ausencia de lastOrder y reintentará la compra si el precio sigue en el target.
}

/**
 * Coloca una orden de venta a mercado y maneja la verificación post-orden.
 * @param {function} handleSuccessfulSell - La función handler de LSelling.js para cerrar el ciclo.
 */
async function placeSellOrder(config, creds, sellAmount, log, handleSuccessfulSell, botState, handlerDependencies) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    const amountToSell = parseNumber(sellAmount);

    log(`Colocando orden de venta a mercado por ${amountToSell.toFixed(8)} BTC.`, 'info');
    try {
        // BitMart usa 'SELL' en mayúsculas
        const order = await bitmartService.placeOrder(creds, SYMBOL, 'SELL', 'market', amountToSell); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            log(`Orden de venta colocada. ID: ${currentOrderId}. Persistiendo bloqueo...`, 'success');
            
            // 1. Crear el objeto lastOrder de venta pendiente (Bloqueo)
            const sellLastOrder = {
                order_id: currentOrderId,
                price: parseNumber(botState.lStateData.ppc), 
                size: amountToSell,
                side: 'SELL',
                state: 'pending_fill'
            };
            
            // 2. Persistir el lastOrder de forma atómica
            await Autobot.findOneAndUpdate({}, { 
                $set: { 'lStateData.lastOrder': sellLastOrder } 
            });

            // 3. LÓGICA DE VERIFICACIÓN INMEDIATA (Market Order): Opción para acelerar el cierre.
            try {
                await new Promise(resolve => setTimeout(resolve, 500)); // Espera corta
                const orderDetails = await bitmartService.getOrderDetail(creds, SYMBOL, currentOrderId);
                const filledVolume = parseNumber(orderDetails.filled_volume || 0);

                if (filledVolume >= amountToSell * 0.999) {
                    log(`Verificación: Orden ID ${currentOrderId} COMPLETADA. Ejecutando handleSuccessfulSell.`, 'success');
                    // Procesa el cierre del ciclo inmediatamente
                    await handleSuccessfulSell(botState, orderDetails, handlerDependencies);                    
                } else {
                    log(`Verificación: Orden ID ${currentOrderId} no llenada. Monitoreo delegado a LSelling.js.`, 'warning');
                }
            } catch (error) {
                // Si falla la verificación inmediata (incluyendo el error 50005)
                log(`Error al verificar la orden ${currentOrderId}: ${error.message}. Monitoreo delegado a LSelling.js.`, 'error');
            }
        } else {
            log(`Error al colocar la orden de venta. No se recibió ID.`, 'error');
        }
    } catch (error) {
        log(`Error de API al colocar la orden: ${error.message}`, 'error');
    }
}

/**
 * Cancela la última orden activa del bot.
 */
async function cancelActiveOrders(botState, creds, log) { // ✅ CRÍTICA: Se pasa creds como dependencia
    if (!botState.lStateData.lastOrder || !botState.lStateData.lastOrder.order_id) {
        log("No hay una orden para cancelar registrada.", 'info');
        return;
    }

    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    const orderId = botState.lStateData.lastOrder.order_id;

    try {
        log(`Intentando cancelar orden ID: ${orderId}...`, 'warning');
        
        // Asumimos que la API de BitMart usa un objeto de credenciales
        const result = await bitmartService.cancelOrder(creds, SYMBOL, orderId); 
        
        if (result && (result.code === 1000 || result.msg.includes('order not exists'))) { // Incluir caso de orden ya cancelada
            log(`Orden ${orderId} cancelada exitosamente o ya inactiva.`, 'success');
        } else {
            log(`No se pudo cancelar la orden ${orderId}. Razón: ${JSON.stringify(result)}`, 'error');
            return; // No limpiamos si la API dice que falló la cancelación y la orden sigue activa.
        }
        
        // Limpiar el lastOrder del estado solo si la cancelación fue exitosa o la orden ya no existe
        await Autobot.findOneAndUpdate({}, { $set: { 'lStateData.lastOrder': null } }); 

    } catch (error) {
        log(`Error de API al intentar cancelar la orden ${orderId}: ${error.message}.`, 'error');
    }
}

module.exports = {
    placeFirstBuyOrder,
    placeCoverageBuyOrder,
    placeSellOrder,
    cancelActiveOrders,
    MIN_USDT_VALUE_FOR_BITMART
};