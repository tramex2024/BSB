// BSB/server/src/utils/orderManager.js

const { placeOrder, getOrderDetail, cancelOrder } = require('../services/bitmartService');
const Autobot = require('../../models/Autobot');
const autobotCore = require('../../autobotLogic');
const { handleSuccessfulBuy, handleSuccessfulSell } = require('./dataManager'); // Necesita funciones de manejo de datos

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;
const ORDER_CHECK_TIMEOUT_MS = 2000;

/**
 * Coloca la primera orden de compra a mercado (Entrada inicial).
 * @param {object} config - Configuración del bot.
 * @param {object} creds - Credenciales de la API.
 */
async function placeFirstBuyOrder(config, creds) {
    const purchaseAmount = parseFloat(config.long.purchaseUsdt);
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    autobotCore.log(`Colocando la primera orden de compra a mercado por ${purchaseAmount.toFixed(2)} USDT.`, 'info');
    try {
        const order = await placeOrder(creds, SYMBOL, 'buy', 'market', purchaseAmount);
        
        if (order && order.order_id) {
            autobotCore.log(`Orden de compra colocada. ID: ${order.order_id}. Esperando confirmación...`, 'success');

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
                await autobotCore.updateBotState('BUYING', botState.sstate); 
            }
            
            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, order.order_id);
                const updatedBotState = await Autobot.findOne({});

                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                        await handleSuccessfulBuy(updatedBotState, orderDetails);
                    }
                } else {
                    autobotCore.log(`La orden inicial ${order.order_id} no se completó. Volviendo al estado RUNNING.`, 'error');
                    if (updatedBotState) {
                        // Limpiar lastOrder antes de volver a RUNNING
                        updatedBotState.lStateData.lastOrder = null;
                        await Autobot.findOneAndUpdate({}, { 'lStateData': updatedBotState.lStateData });
                        await autobotCore.updateBotState('RUNNING', updatedBotState.sstate);
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {
            // Manejo de error de colocación
        }
    } catch (error) {
        // Manejo de error de API
    }
}


/**
 * Coloca una orden de compra de cobertura (a Mercado).
 * @param {object} botState - Estado actual del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {number} usdtAmount - Cantidad de USDT para la orden.
 * @param {number} nextCoveragePrice - Precio de disparo (solo para referencia).
 */
async function placeCoverageBuyOrder(botState, creds, usdtAmount, nextCoveragePrice) {
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    autobotCore.log(`Colocando orden de cobertura a MERCADO por ${usdtAmount.toFixed(2)} USDT.`, 'info');
    
    try {
        const order = await placeOrder(creds, SYMBOL, 'buy', 'market', usdtAmount);

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
            autobotCore.log(`Orden de cobertura colocada. ID: ${order.order_id}. Esperando confirmación...`, 'success');

            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, order.order_id);
                const updatedBotState = await Autobot.findOne({});
                
                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                         await handleSuccessfulBuy(updatedBotState, orderDetails); 
                    }
                } else {
                    autobotCore.log(`La orden de cobertura ${order.order_id} no se completó.`, 'error');
                    if (updatedBotState) {
                         updatedBotState.lStateData.lastOrder = null;
                         await Autobot.findOneAndUpdate({}, { 'lStateData': updatedBotState.lStateData });
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {
            // Manejo de error de colocación
        }
    } catch (error) {
        // Manejo de error de API
    }
}


/**
 * Coloca una orden de venta a mercado.
 * @param {object} config - Configuración del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {number} sellAmount - Cantidad de la moneda base a vender (e.g., BTC).
 */
async function placeSellOrder(config, creds, sellAmount) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    autobotCore.log(`Colocando orden de venta a mercado por ${sellAmount.toFixed(8)} BTC.`, 'info');
    try {
        const order = await placeOrder(creds, SYMBOL, 'sell', 'market', sellAmount);

        if (order && order.order_id) {
            autobotCore.log(`Orden de venta colocada. ID: ${order.order_id}. Esperando confirmación...`, 'success');

            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, order.order_id);
                if (orderDetails && orderDetails.state === 'filled') {
                    const botState = await Autobot.findOne({});
                    if (botState) {
                        // Pasamos las credenciales para que handleSuccessfulSell pueda reiniciar la compra.
                        await handleSuccessfulSell(botState, orderDetails, config, creds); 
                    }
                } else {
                    autobotCore.log(`La orden de venta ${order.order_id} no se completó.`, 'error');
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {
            // Manejo de error de colocación
        }
    } catch (error) {
        // Manejo de error de API
    }
}

/**
 * Cancela la última orden activa del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {object} botState - Estado actual del bot.
 */
async function cancelActiveOrders(creds, botState) {
    if (!botState.lStateData.lastOrder || !botState.lStateData.lastOrder.order_id) {
        autobotCore.log("No hay una orden para cancelar registrada.", 'info');
        return;
    }

    // Lógica de cancelación...
}

module.exports = {
    placeFirstBuyOrder,
    placeCoverageBuyOrder,
    placeSellOrder,
    cancelActiveOrders,
    MIN_USDT_VALUE_FOR_BITMART
};