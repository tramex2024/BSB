const { placeOrder, getOrderDetail, cancelOrder } = require('../../services/bitmartService');
const Autobot = require('../../models/Autobot');
const { handleSuccessfulBuy, handleSuccessfulSell } = require('./dataManager'); 

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;
const ORDER_CHECK_TIMEOUT_MS = 2000;

/**
 * Coloca la primera orden de compra a mercado (Entrada inicial) y descuenta el capital del LBalance.
 * @param {object} config - Configuración del bot.
 * @param {function} log - Función de logging.
 * @param {function} updateBotState - Función para actualizar el estado del bot (notificación).
 * @param {function} updateGeneralBotState - Función para actualizar el estado general (LBalance).
 */
async function placeFirstBuyOrder(config, log, updateBotState, updateGeneralBotState) { 
    const purchaseAmount = parseFloat(config.long.purchaseUsdt);
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    log(`Colocando la primera orden de compra a mercado por ${purchaseAmount.toFixed(2)} USDT.`, 'info');
    try {
        // La llamada a placeOrder ahora es correcta (4 argumentos: symbol, side, type, amount)
        const order = await placeOrder(SYMBOL, 'BUY', 'market', purchaseAmount); 
        
        if (order && order.order_id) {
            log(`Orden de compra colocada. ID: ${order.order_id}. Iniciando bloqueo y monitoreo...`, 'success');

            const currentOrderId = order.order_id;
            // Leer el estado más reciente justo antes de la transacción
            let botState = await Autobot.findOne({}); 

            if (botState) {
                // 1. DESCUENTO DEL LBALANCE ASIGNADO
                const currentLBalance = parseFloat(botState.lbalance || 0);
                const newLBalance = currentLBalance - purchaseAmount;

                // 2. Persistir el NUEVO LBalance
                await updateGeneralBotState({ lbalance: newLBalance });
                log(`LBalance asignado reducido en ${purchaseAmount.toFixed(2)} USDT para la orden inicial. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');

                // 3. 🛑 CORRECCIÓN CLAVE: BLOQUEO, ID y TRANSICIÓN DE ESTADO (¡UNIFICADO ATÓMICAMENTE!)
                const updatedLStateData = {
                    ...botState.lStateData,
                    orderCountInCycle: 1, // CANDADO
                    lastOrder: {
                        order_id: currentOrderId,
                        price: null,
                        size: null,
                        side: 'buy',
                        state: 'pending_fill',
                        usdt_amount: purchaseAmount, 
                    }
                };
                
                // Asegura que 'lstate' sea 'BUYING' y 'orderCountInCycle' sea '1' en una sola operación DB.
                await Autobot.findOneAndUpdate({}, { 
                    'lStateData': updatedLStateData,
                    'lstate': 'BUYING' // Transición de estado de RUNNING a BUYING
                });
                
                // NOTIFICACIÓN: Actualizar el estado del socket/frontend
                await updateBotState('BUYING', 'long'); 
                log(`Estado de la estrategia RUNNING actualizado a: BUYING`);
            }
            
            // Bloque de monitoreo de la orden
            setTimeout(async () => {           
                const orderDetails = await getOrderDetail(SYMBOL, currentOrderId); 
                let updatedBotState = await Autobot.findOne({});

                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                        // Pasar updateGeneralBotState y log
                        await handleSuccessfulBuy(updatedBotState, orderDetails, updateGeneralBotState, log); 
                    }
                } else {
                    // Si falla, DEVOLVEMOS EL LBALANCE y regresamos a RUNNING.
                    log(`La orden inicial ${currentOrderId} no se completó/falló. DEVOLVIENDO LBALANCE y volviendo a RUNNING.`, 'error');
                    if (updatedBotState) {
                        const finalState = await Autobot.findOne({});
                        const returnedLBalance = parseFloat(finalState.lbalance) + purchaseAmount;
                        await updateGeneralBotState({ lbalance: returnedLBalance });
                        log(`LBalance devuelto: ${purchaseAmount.toFixed(2)} USDT. Nuevo balance: ${returnedLBalance.toFixed(2)} USDT.`, 'warning');
                        
                        await Autobot.findOneAndUpdate({}, { 
                            'lStateData.lastOrder': null,
                            'lStateData.orderCountInCycle': 0 
                        });
                        await updateBotState('RUNNING', 'long'); 
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {       
            log(`Error al colocar la primera orden de compra. La API no devolvió un ID. Volviendo a RUNNING.`, 'error');
            await updateBotState('RUNNING', 'long');
        }
    } catch (error) {
        log(`Error de excepción al colocar la primera orden de compra: ${error.message}. Volviendo a RUNNING.`, 'error');
        await updateBotState('RUNNING', 'long');
    }
}

/**
 * Coloca una orden de compra de cobertura (a Mercado).
 * @param {object} botState - Estado actual del bot.
 * @param {number} usdtAmount - Cantidad de USDT a comprar.
 * @param {number} nextCoveragePrice - Precio de la próxima orden de cobertura.
 * @param {function} log - Función de logging.
 * @param {function} updateGeneralBotState - Función para actualizar el estado general.
 */
async function placeCoverageBuyOrder(botState, usdtAmount, nextCoveragePrice, log, updateGeneralBotState) { 
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    log(`Colocando orden de cobertura a MERCADO por ${usdtAmount.toFixed(2)} USDT.`, 'info');
    
    try {
        // La llamada a placeOrder ahora es correcta (4 argumentos: symbol, side, type, amount)
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
                
                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                        // Pasar updateGeneralBotState y log
                        await handleSuccessfulBuy(updatedBotState, orderDetails, updateGeneralBotState, log); 
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
                if (orderDetails && orderDetails.state === 'filled') {
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