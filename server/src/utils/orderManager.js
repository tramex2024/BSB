// BSB/server/src/utils/orderManager.js (ACTUALIZADO)

const { placeOrder, getOrderDetail, cancelOrder } = require('../../services/bitmartService');
const Autobot = require('../../models/Autobot');
// const autobotCore = require('../../autobotLogic'); // ¡ELIMINADO!
const { handleSuccessfulBuy, handleSuccessfulSell } = require('./dataManager'); // Necesita funciones de manejo de datos

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;
const ORDER_CHECK_TIMEOUT_MS = 2000;

/**
 * Coloca la primera orden de compra a mercado (Entrada inicial).
 * @param {object} config - Configuración del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {function} log - Función de logging inyectada.
 * @param {function} updateBotState - Función para cambiar el estado inyectada.
 */
async function placeFirstBuyOrder(config, creds, log, updateBotState) {
    const purchaseAmount = parseFloat(config.long.purchaseUsdt);
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    log(`Colocando la primera orden de compra a mercado por ${purchaseAmount.toFixed(2)} USDT.`, 'info');
    try {
        const order = await placeOrder(creds, SYMBOL, 'BUY', 'market', purchaseAmount);
        
        if (order && order.order_id) {
            log(`Orden de compra colocada. ID: ${order.order_id}. Esperando confirmación...`, 'success');

            const botState = await Autobot.findOne({});
            if (botState) {
                // Guarda el ID y cambia el estado inmediatamente a BUYING para evitar spam
                botState.lStateData.lastOrder = {
                    order_id: order.order_id,
                    price: null,
                    size: null, 
                    side: 'buy',
                    state: 'pending_fill'
                };
                await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });
                
                // Usamos la función inyectada
                await updateBotState('BUYING', botState.sstate); 
            }
            
            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, order.order_id);
                const updatedBotState = await Autobot.findOne({});

                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                        await handleSuccessfulBuy(updatedBotState, orderDetails);
                    }
                } else {
                    log(`La orden inicial ${order.order_id} no se completó. Volviendo al estado RUNNING.`, 'error');
                    if (updatedBotState) {
                        // Limpiar lastOrder antes de volver a RUNNING
                        updatedBotState.lStateData.lastOrder = null;
                        await Autobot.findOneAndUpdate({}, { 'lStateData': updatedBotState.lStateData });
                        // Usamos la función inyectada
                        await updateBotState('RUNNING', updatedBotState.sstate);
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {
            log(`Error al colocar la primera orden de compra. Respuesta API: ${JSON.stringify(order)}`, 'error');
        }
    } catch (error) {
        log(`Error de API al colocar la primera orden de compra: ${error.message}`, 'error');
    }
}


/**
 * Coloca una orden de compra de cobertura (a Mercado).
 * @param {object} botState - Estado actual del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {number} usdtAmount - Cantidad de USDT para la orden.
 * @param {number} nextCoveragePrice - Precio de disparo (solo para referencia).
 * @param {function} log - Función de logging inyectada.
 */
async function placeCoverageBuyOrder(botState, creds, usdtAmount, nextCoveragePrice, log) {
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    log(`Colocando orden de cobertura a MERCADO por ${usdtAmount.toFixed(2)} USDT.`, 'info');
    
    try {
        const order = await placeOrder(creds, SYMBOL, 'BUY', 'market', usdtAmount);

        if (order && order.order_id) {
            // Guardamos el ID inmediatamente 
            botState.lStateData.lastOrder = {
                order_id: order.order_id,
                price: nextCoveragePrice, 
                size: usdtAmount, 
                side: 'buy',
                state: 'pending_fill'
            };
            await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });
            log(`Orden de cobertura colocada. ID: ${order.order_id}. Esperando confirmación...`, 'success');

            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, order.order_id);
                const updatedBotState = await Autobot.findOne({});
                
                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                           await handleSuccessfulBuy(updatedBotState, orderDetails); 
                    }
                } else {
                    log(`La orden de cobertura ${order.order_id} no se completó.`, 'error');
                    if (updatedBotState) {
                           updatedBotState.lStateData.lastOrder = null;
                           await Autobot.findOneAndUpdate({}, { 'lStateData': updatedBotState.lStateData });
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {
            log(`Error al colocar la orden de cobertura. Respuesta API: ${JSON.stringify(order)}`, 'error');
        }
    } catch (error) {
        log(`Error de API al colocar la orden de cobertura: ${error.message}`, 'error');
    }
}


/**
 * Coloca una orden de venta a mercado.
 * @param {object} config - Configuración del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {number} sellAmount - Cantidad de la moneda base a vender (e.g., BTC).
 * @param {function} log - Función de logging inyectada.
 */
async function placeSellOrder(config, creds, sellAmount, log) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    log(`Colocando orden de venta a mercado por ${sellAmount.toFixed(8)} BTC.`, 'info');
    try {
        const order = await placeOrder(creds, SYMBOL, 'SELL', 'market', sellAmount);

        if (order && order.order_id) {
            log(`Orden de venta colocada. ID: ${order.order_id}. Esperando confirmación...`, 'success');

            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, order.order_id);
                if (orderDetails && orderDetails.state === 'filled') {
                    const botState = await Autobot.findOne({});
                    if (botState) {
                        // Pasamos las credenciales para que handleSuccessfulSell pueda reiniciar la compra.
                        await handleSuccessfulSell(botState, orderDetails, config, creds); 
                    }
                } else {
                    log(`La orden de venta ${order.order_id} no se completó.`, 'error');
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

    // Lógica de cancelación...
    // Debes añadir aquí la lógica real de cancelación, que también usa 'log'
    // ...
    // try {
    //    await cancelOrder(creds, SYMBOL, botState.lStateData.lastOrder.order_id);
    //    log(`Orden ${botState.lStateData.lastOrder.order_id} cancelada exitosamente.`, 'success');
    // } catch(e) {
    //    log(`Error al cancelar orden ${botState.lStateData.lastOrder.order_id}: ${e.message}`, 'error');
    // }
}

module.exports = {
    placeFirstBuyOrder,
    placeCoverageBuyOrder,
    placeSellOrder,
    cancelActiveOrders,
    MIN_USDT_VALUE_FOR_BITMART
};