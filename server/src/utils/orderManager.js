// BSB/server/src/utils/orderManager.js (CORREGIDO - Manejo de errores en placeSellOrder y guardado de lastOrder + FIX de getOrderDetail)

const { placeOrder, getOrderDetail, cancelOrder } = require('../../services/bitmartService');
const Autobot = require('../../models/Autobot');
const { handleSuccessfulBuy, handleSuccessfulSell } = require('./dataManager'); 

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;
const ORDER_CHECK_TIMEOUT_MS = 2000;

/**
 * Coloca la primera orden de compra a mercado (Entrada inicial).
 * ... (documentación omitida por brevedad) ...
 */
async function placeFirstBuyOrder(config, creds, log, updateBotState, updateGeneralBotState) { 
    const purchaseAmount = parseFloat(config.long.purchaseUsdt);
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    log(`Colocando la primera orden de compra a mercado por ${purchaseAmount.toFixed(2)} USDT.`, 'info');
    try {
        // placeOrder SÍ necesita 'creds'
        const order = await placeOrder(creds, SYMBOL, 'BUY', 'market', purchaseAmount); 
        
        if (order && order.order_id) {
            log(`Orden de compra colocada. ID: ${order.order_id}. Esperando confirmación...`, 'success');

            const currentOrderId = order.order_id;
            
            let botState = await Autobot.findOne({}); 

            if (botState) {
                // Pre-guardar el ID y establecer el estado de 'pending'
                botState.lStateData.lastOrder = {
                    order_id: currentOrderId,
                    price: null,
                    size: null, 
                    side: 'buy',
                    state: 'pending_fill'
                };
                await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });
                
                // Transicionar a BUYING
                await updateBotState('BUYING', 'long'); 
                log(`Estado de la estrategia RUNNING actualizado a: BUYING`);
            }
            
            setTimeout(async () => {
                // 💡 CORRECCIÓN CRÍTICA: Eliminamos 'creds'
                const orderDetails = await getOrderDetail(SYMBOL, currentOrderId); 
                let updatedBotState = await Autobot.findOne({});

                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                        await handleSuccessfulBuy(updatedBotState, orderDetails, updateGeneralBotState); 
                    }
                } else {
                    log(`La orden inicial ${currentOrderId} no se completó. Volviendo al estado RUNNING.`, 'error');
                    if (updatedBotState) {
                        updatedBotState.lStateData.lastOrder = null;
                        updatedBotState.lStateData.orderCountInCycle = 0; 

                        await Autobot.findOneAndUpdate({}, { 'lStateData': updatedBotState.lStateData });
                        await updateBotState('RUNNING', 'long');
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {        
            log(`Error al colocar la primera orden de compra. Respuesta API: ${JSON.stringify(order)}`, 'error');
            await updateBotState('RUNNING', 'long');
        }
    } catch (error) {
        log(`Error de API al colocar la primera orden de compra: ${error.message}`, 'error');
        await updateBotState('RUNNING', 'long');
    }
}


/**
 * Coloca una orden de compra de cobertura (a Mercado).
 * ... (documentación omitida por brevedad) ...
 */
async function placeCoverageBuyOrder(botState, creds, usdtAmount, nextCoveragePrice, log, updateGeneralBotState) {
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    log(`Colocando orden de cobertura a MERCADO por ${usdtAmount.toFixed(2)} USDT.`, 'info');
    
    try {
        // placeOrder SÍ necesita 'creds'
        const order = await placeOrder(creds, SYMBOL, 'BUY', 'market', usdtAmount);

        if (order && order.order_id) {
            const currentOrderId = order.order_id;     

            // Guardamos el ID inmediatamente 
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
                // 💡 CORRECCIÓN CRÍTICA: Eliminamos 'creds'
                const orderDetails = await getOrderDetail(SYMBOL, currentOrderId);
                const updatedBotState = await Autobot.findOne({});
                
                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                         await handleSuccessfulBuy(updatedBotState, orderDetails); 
                    }
                } else {
                    log(`La orden de cobertura ${currentOrderId} no se completó.`, 'error');
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
 * ... (documentación omitida por brevedad) ...
 */
async function placeSellOrder(config, creds, sellAmount, log, handleSuccessfulSell, botState, handlerDependencies) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    log(`Colocando orden de venta a mercado por ${sellAmount.toFixed(8)} BTC.`, 'info');
    try {
        // placeOrder SÍ necesita 'creds'
        const order = await placeOrder(creds, SYMBOL, 'SELL', 'market', sellAmount);

        // 💡 CORRECCIÓN CRÍTICA #1: SOLO CONTINUAR SI LA ORDEN TIENE ID
        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            log(`Orden de venta colocada. ID: ${currentOrderId}. Esperando confirmación...`, 'success');
            
            // CRÍTICO: Guardar lastOrder inmediatamente
            botState.lStateData.lastOrder = {
                order_id: currentOrderId,
                price: botState.lStateData.pc, // Usamos el PC como precio de referencia
                size: sellAmount,
                side: 'sell',
                state: 'pending_fill'
            };
            await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });


            setTimeout(async () => {
                // 💡 CORRECCIÓN CRÍTICA: Eliminamos 'creds'
                const orderDetails = await getOrderDetail(SYMBOL, currentOrderId);
                if (orderDetails && orderDetails.state === 'filled') {
                    await handleSuccessfulSell(botState, orderDetails, handlerDependencies); 
                } else {
                    log(`La orden de venta ${currentOrderId} no se completó.`, 'error');
                    // Si no se completa, limpiamos el lastOrder.
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
 * @param {object} creds - Credenciales de la API.
 * @param {object} botState - Estado actual del bot.
 * @param {function} log - Función de logging inyectada.
 */
async function cancelActiveOrders(creds, botState, log) {
    if (!botState.lStateData.lastOrder || !botState.lStateData.lastOrder.order_id) {
        log("No hay una orden para cancelar registrada.", 'info');
        return;
    }

    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    const orderId = botState.lStateData.lastOrder.order_id;
    
    try {
        log(`Intentando cancelar orden ID: ${orderId}...`, 'warning');
        
        // 💡 LLAMADA CRÍTICA: Ejecutar la cancelación (cancelOrder SÍ necesita creds)
        const result = await cancelOrder(creds, SYMBOL, orderId);
        
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