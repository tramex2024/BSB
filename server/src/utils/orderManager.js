const { placeOrder, getOrderDetail, cancelOrder } = require('../../services/bitmartService');
const Autobot = require('../../models/Autobot');
const { handleSuccessfulBuy, handleSuccessfulSell } = require('./dataManager'); 

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;
const ORDER_CHECK_TIMEOUT_MS = 2000;

/**
 * Coloca la primera orden de compra (o inicial) y realiza un bloqueo atómico.
 * * @param {object} config - Configuración del bot.
 * @param {function} log - Función de logging.
 * @param {function} updateBotState - Función para actualizar el estado del bot (lstate/sstate).
 * @param {function} updateGeneralBotState - Función para actualizar campos generales (lbalance/sbalance).
 */
async function placeFirstBuyOrder(config, log, updateBotState, updateGeneralBotState) {
    
    // --- 1. BLOQUEO ATÓMICO Y TRANSICIÓN DE ESTADO ---
    // Intentamos cambiar el estado de RUNNING a BUYING en una sola operación atómica.
    
    const initialCheck = await Autobot.findOneAndUpdate(
        { lstate: 'RUNNING' }, // Condición: SOLO actualiza si el estado actual es RUNNING.
        { $set: { lstate: 'BUYING' } }, // Actualización: Cambia el estado a BUYING.
        { new: true } // Retorna el documento actualizado (si la operación fue exitosa).
    );

    if (!initialCheck) {
        // Esto significa que otro ciclo ya se adelantó y cambió el estado. ¡Bloqueo exitoso!
        log('Advertencia: Intento de doble compra bloqueado. El estado ya ha cambiado a BUYING.', 'warning');
        return; 
    }
    
    // Si el código llega a este punto, hemos asegurado la DB y el estado AHORA es BUYING.
    // --------------------------------------------------------------------
    
    const { purchaseUsdt } = config.long;
    const SYMBOL = config.symbol;
    const amount = parseFloat(purchaseUsdt);

    if (amount < 5) {
        log('Error: La cantidad de compra es menor al mínimo de BitMart ($5). Cancelando.', 'error');
        // Revertir el estado ya que no se colocó la orden real
        await updateBotState('RUNNING', 'long'); 
        return;
    }

    log(`Colocando la primera orden de compra a mercado por ${amount.toFixed(2)} USDT.`, 'info');

    try {
        // --- 2. COLOCACIÓN DE ORDEN REAL ---
        // Asumiendo que bitmartService.placeMarketOrder existe y devuelve el orderId.
        const orderResult = await bitmartService.placeMarketOrder({
            symbol: SYMBOL,
            side: 'buy',
            notional: amount // Monto en USDT
        });

        if (!orderResult || !orderResult.order_id) {
            log(`Error al recibir ID de la orden de BitMart. Resultado: ${JSON.stringify(orderResult)}`, 'error');
            // Revertir el estado si la orden no se pudo colocar (por ejemplo, error de API)
            await updateBotState('RUNNING', 'long'); 
            return;
        }

        const orderId = orderResult.order_id;
        log(`Orden de compra colocada. ID: ${orderId}. Iniciando bloqueo y monitoreo...`, 'info');

        // --- 3. ACTUALIZACIÓN DE ESTADO Y BALANCE ---

        // Asumiendo que initialCheck contiene el botState actualizado (lstate: BUYING)
        const currentBotState = initialCheck; 
        const currentLBalance = parseFloat(currentBotState.lbalance || 0);
        
        // Descontar la cantidad de compra del LBalance.
        const newLBalance = currentLBalance - amount;

        // Guardar el lastOrder y el nuevo LBalance
        await updateGeneralBotState({
            'lbalance': newLBalance,
            'lStateData.lastOrder': {
                order_id: orderId,
                side: 'buy',
                usdt_amount: amount,
                // Agrega otros campos necesarios aquí
            }
        });

        log(`LBalance asignado reducido en ${amount.toFixed(2)} USDT para la orden inicial. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');
        
        // No es necesario llamar a updateBotState aquí, ya que el bloqueo atómico ya lo hizo.

    } catch (error) {
        log(`Error CRÍTICO al colocar la primera orden: ${error.message}`, 'error');
        
        // Revertir el estado a RUNNING en caso de un error de API/Excepción
        await updateBotState('RUNNING', 'long');
    }
}
/**
 * Coloca una orden de compra de cobertura (a Mercado).
 * @param {object} botState - Estado actual del bot.
 * @param {number} usdtAmount - Cantidad de USDT a comprar.
 * @param {number} nextCoveragePrice - Precio de la próxima orden de cobertura (solo para referencia de DB).
 * @param {function} log - Función de logging.
 * @param {function} updateGeneralBotState - Función para actualizar el estado general.
 */
async function placeCoverageBuyOrder(botState, usdtAmount, nextCoveragePrice, log, updateGeneralBotState) { 
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    log(`Colocando orden de cobertura a MERCADO por ${usdtAmount.toFixed(2)} USDT.`, 'info');
    
    try {
        const order = await placeOrder(SYMBOL, 'BUY', 'market', usdtAmount);

        if (order && order.order_id) {
            const currentOrderId = order.order_id;    

            botState.lStateData.lastOrder = {
                order_id: currentOrderId,
                price: nextCoveragePrice,   
                size: usdtAmount,   
                side: 'buy',
                state: 'pending_fill'
            };
            await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });
            log(`Orden de cobertura colocada. ID: ${currentOrderId}. Esperando confirmación...`, 'success');

            setTimeout(async () => {
                const orderDetails = await getOrderDetail(SYMBOL, currentOrderId);
                const updatedBotState = await Autobot.findOne({});
                const filledSize = parseFloat(orderDetails?.filledSize || 0);
                
                // ÉXITO: Si está 'filled' O si hay ejecución parcial (filledSize > 0)
                if ((orderDetails && orderDetails.state === 'filled') || filledSize > 0) {
                    if (updatedBotState) {
                        // Pasar updateGeneralBotState y log
                        await handleSuccessfulBuy(updatedBotState, orderDetails, updateGeneralBotState, log); 
                    }
                } else {
                    log(`La orden de cobertura ${currentOrderId} no se completó/falló sin ejecución.`, 'error');
                    // Si la orden falla, limpiamos el lastOrder
                    if (updatedBotState) {
                        updatedBotState.lStateData.lastOrder = null;
                        await Autobot.findOneAndUpdate({}, { 'lStateData': updatedBotState.lStateData });
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {
            log(`Error al colocar la orden de cobertura. Respuesta API: ${JSON.stringify(order)}`, 'error');
            botState.lStateData.lastOrder = null;
            await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });
        }
    } catch (error) {
        log(`Error de API al colocar la orden de cobertura: ${error.message}`, 'error');
        botState.lStateData.lastOrder = null;
        await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });
    }
}


/**
 * Coloca una orden de venta a mercado.
 * @param {object} config - Configuración del bot.
 * @param {number} sellAmount - Cantidad de la moneda base a vender (e.g., BTC).
 * @param {function} log - Función de logging.
 * @param {function} handleSuccessfulSell - Función de manejo de venta exitosa.
 * @param {object} botState - Estado actual del bot.
 * @param {object} handlerDependencies - Dependencias necesarias para el handler de venta.
 */
async function placeSellOrder(config, sellAmount, log, handleSuccessfulSell, botState, handlerDependencies) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    log(`Colocando orden de venta a mercado por ${sellAmount.toFixed(8)} BTC.`, 'info');
    try {
        const order = await placeOrder(SYMBOL, 'SELL', 'market', sellAmount);

        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            log(`Orden de venta colocada. ID: ${currentOrderId}. Esperando confirmación...`, 'success');
            
            botState.lStateData.lastOrder = {
                order_id: currentOrderId,
                price: botState.lStateData.pc,
                size: sellAmount,
                side: 'sell',
                state: 'pending_fill'
            };
            await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });


            setTimeout(async () => {
                const orderDetails = await getOrderDetail(SYMBOL, currentOrderId);
                const filledSize = parseFloat(orderDetails?.filledSize || 0);

                if ((orderDetails && orderDetails.state === 'filled') || filledSize > 0) {
                    await handleSuccessfulSell(botState, orderDetails, handlerDependencies); 
                } else {
                    log(`La orden de venta ${currentOrderId} no se completó.`, 'error');
                    const updatedBotState = await Autobot.findOne({});
                    if (updatedBotState) {
                        updatedBotState.lStateData.lastOrder = null;
                        await Autobot.findOneAndUpdate({}, { 'lStateData': updatedBotState.lStateData });
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {
            log(`Error al colocar la orden de venta. Respuesta API: ${JSON.stringify(order)}`, 'error');
        }
    } catch (error) {
        log(`Error de API al colocar la orden de venta: ${error.message}`, 'error');
    }
}

/**
 * Cancela la última orden activa del bot.
 * @param {object} botState - Estado actual del bot.
 * @param {function} log - Función de logging inyectada.
 */
async function cancelActiveOrders(botState, log) {
    if (!botState.lStateData.lastOrder || !botState.lStateData.lastOrder.order_id) {
        log("No hay una orden para cancelar registrada.", 'info');
        return;
    }

    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    const orderId = botState.lStateData.lastOrder.order_id;
    
    try {
        log(`Intentando cancelar orden ID: ${orderId}...`, 'warning');
        
        const result = await cancelOrder(SYMBOL, orderId);
        
        if (result && result.code === 1000) {
            log(`Orden ${orderId} cancelada exitosamente.`, 'success');
        } else {
            log(`No se pudo cancelar la orden ${orderId}. Razón: ${JSON.stringify(result)}`, 'error');
        }
        
        // Limpiar el lastOrder del estado
        botState.lStateData.lastOrder = null;
        await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });

    } catch (error) {
        log(`Error de API al intentar cancelar la orden ${orderId}: ${error.message}`, 'error');
    }
}

module.exports = {
    placeFirstBuyOrder,
    placeCoverageBuyOrder,
    placeSellOrder,
    cancelActiveOrders,
    MIN_USDT_VALUE_FOR_BITMART
};