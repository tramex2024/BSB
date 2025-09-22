// BSB/server/src/longUtils.js

const { placeOrder, getOrderDetails, cancelOrder } = require('../services/bitmartService');
const Autobot = require('../models/Autobot');
const autobotCore = require('../autobotLogic');
const { getBotConfiguration } = require('../routes/autobotRoutes'); 

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;

/**
 * Coloca una orden de compra de cobertura.
 * @param {object} botState - Estado actual del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {number} usdtAmount - Cantidad de USDT para la orden.
 * @param {number} nextCoveragePrice - Precio límite de la orden.
 */
async function placeCoverageBuyOrder(botState, creds, usdtAmount, nextCoveragePrice) {
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    autobotCore.log(`Colocando orden de cobertura por ${usdtAmount.toFixed(2)} USDT en el precio ${nextCoveragePrice.toFixed(2)}.`, 'info');
    
    try {
        const order = await placeOrder(creds, SYMBOL, 'buy', 'limit', usdtAmount, nextCoveragePrice);

        if (order && order.order_id) {
            botState.lStateData.lastOrder = {
                order_id: order.order_id,
                price: nextCoveragePrice,
                size: usdtAmount / nextCoveragePrice,
                side: 'buy',
                state: 'new'
            };
            await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });
            autobotCore.log(`Orden de cobertura colocada. ID: ${order.order_id}.`, 'success');
        } else {
            autobotCore.log('Error: La respuesta de la orden de cobertura no contiene un ID.', 'error');
        }
    } catch (error) {
        autobotCore.log(`Error al colocar la orden de cobertura: ${error.message}`, 'error');
    }
}

/**
 * Lógica para manejar una orden de compra exitosa.
 * @param {object} botStateObj - Objeto de estado del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart.
 */
async function handleSuccessfulBuy(botStateObj, orderDetails) {
    autobotCore.log(`Orden de compra exitosa. ID: ${orderDetails.order_id}`, 'success');

    botStateObj.lStateData.lastOrder = {
        order_id: orderDetails.order_id,
        price: parseFloat(orderDetails.price),
        size: parseFloat(orderDetails.size),
        side: 'buy',
        state: 'filled'
    };

    const newSize = parseFloat(orderDetails.size);
    const newPrice = parseFloat(orderDetails.price);

    const currentAC = botStateObj.lStateData.ac || 0;
    const currentPPC = botStateObj.lStateData.ppc || 0;
    const currentOrderCount = botStateObj.lStateData.orderCountInCycle || 0;

    const totalUSDT = (currentAC * currentPPC) + (newSize * newPrice);
    botStateObj.lStateData.ac = currentAC + newSize;
    botStateObj.lStateData.ppc = totalUSDT / botStateObj.lStateData.ac;
    botStateObj.lStateData.orderCountInCycle = currentOrderCount + 1;
    
    await Autobot.findOneAndUpdate({}, { 'lStateData': botStateObj.lStateData });
    await autobotCore.updateBotState('BUYING', botStateObj.sstate);
}

/**
 * Lógica para manejar una orden de venta exitosa y el inicio del nuevo ciclo.
 * @param {object} botStateObj - Objeto de estado del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart.
 */
async function handleSuccessfulSell(botStateObj, orderDetails, config) {
    autobotCore.log(`Orden de venta exitosa. ID: ${orderDetails.order_id}`, 'success');

    botStateObj.lStateData = {
        ppc: 0,
        ac: 0,
        orderCountInCycle: 0,
        lastOrder: null,
        pm: 0,
        pc: 0,
        pv: 0
    };

    await Autobot.findOneAndUpdate({}, { 'lStateData': botStateObj.lStateData });
    
    if (config.long.stopAtCycle) {
        autobotCore.log('stopAtCycle activado. Bot Long se detendrá.', 'info');
        await autobotCore.updateBotState('STOPPED', botStateObj.sstate);
    } else {
        await autobotCore.updateBotState('BUYING', botStateObj.sstate);
        const purchaseAmount = parseFloat(config.long.purchaseUsdt);
        
        autobotCore.log(`Venta completada. Reiniciando ciclo con una nueva compra a mercado por ${purchaseAmount.toFixed(2)} USDT.`, 'info');
        await placeFirstBuyOrder(config, null);
    }
}

/**
 * Coloca la primera orden de compra a mercado.
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
            
            setTimeout(async () => {
                const orderDetails = await getOrderDetails(creds, SYMBOL, order.order_id);
                if (orderDetails && orderDetails.state === 'filled') {
                    const botState = await Autobot.findOne({});
                    if (botState) {
                        await handleSuccessfulBuy(botState, orderDetails);
                    }
                } else {
                    autobotCore.log(`La orden inicial ${order.order_id} no se completó. Estado: ${orderDetails?.state || 'desconocido'}. Volviendo al estado RUNNING.`, 'error');
                    const botState = await Autobot.findOne({});
                    if (botState) {
                        await autobotCore.updateBotState('RUNNING', botState.sstate);
                    }
                }
            }, 10000);
        } else {
            autobotCore.log('Error: La respuesta de la orden de compra no contiene un ID. Volviendo al estado RUNNING.', 'error');
            const botState = await Autobot.findOne({});
            if (botState) {
                await autobotCore.updateBotState('RUNNING', botState.sstate);
            }
        }
    } catch (error) {
        autobotCore.log(`Error al colocar la primera orden de compra: ${error.message}. Volviendo al estado RUNNING.`, 'error');
        const botState = await Autobot.findOne({});
        if (botState) {
            await autobotCore.updateBotState('RUNNING', botState.sstate);
        }
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
                const orderDetails = await getOrderDetails(creds, SYMBOL, order.order_id);
                if (orderDetails && orderDetails.state === 'filled') {
                    const botState = await Autobot.findOne({});
                    if (botState) {
                        await handleSuccessfulSell(botState, orderDetails, config);
                    }
                } else {
                    autobotCore.log(`La orden de venta ${order.order_id} no se completó. Estado: ${orderDetails?.state || 'desconocido'}.`, 'error');
                }
            }, 10000);
        } else {
            autobotCore.log('Error: La respuesta de la orden de venta no contiene un ID.', 'error');
        }
    } catch (error) {
        autobotCore.log(`Error al colocar la orden de venta: ${error.message}`, 'error');
    }
}

/**
 * Cancela todas las órdenes activas del bot.
 */
async function cancelActiveOrders(creds, botState) {
    if (!botState.lStateData.lastOrder || !botState.lStateData.lastOrder.order_id) {
        autobotCore.log("No hay una orden para cancelar registrada en la base de datos.", 'info');
        return;
    }

    const config = getBotConfiguration();
    const SYMBOL = config.symbol || TRADE_SYMBOL;
    const orderIdToCancel = botState.lStateData.lastOrder.order_id;
    autobotCore.log(`Intentando cancelar la orden ${orderIdToCancel}.`, 'info');

    try {
        await cancelOrder(creds, SYMBOL, orderIdToCancel);
        autobotCore.log(`Orden ${orderIdToCancel} cancelada exitosamente.`, 'success');
        
        botState.lStateData.lastOrder = null;
        await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });

    } catch (error) {
        autobotCore.log(`Error al cancelar la orden ${orderIdToCancel}: ${error.message}`, 'error');
    }
}

/**
 * Verifica si se necesita colocar una nueva orden de cobertura y la coloca.
 */
async function checkAndPlaceCoverageOrder(botState, availableUSDT, currentPrice, creds, config) {
    if (botState.lStateData.lastOrder && botState.lStateData.lastOrder.side === 'buy' && botState.lStateData.lastOrder.order_id) {
        try {
            const orderDetails = await getOrderDetails(creds, config.symbol || TRADE_SYMBOL, botState.lStateData.lastOrder.order_id);
            if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                autobotCore.log(`Ya hay una orden de cobertura activa (ID: ${orderDetails.order_id}). Esperando su ejecución.`, 'info');
                return;
            }
        } catch (error) {
            autobotCore.log(`Error al verificar el estado de la orden ${botState.lStateData.lastOrder.order_id}. ${error.message}`, 'error');
        }
    }
    
    const lastOrderUsdtAmount = botState.lStateData.lastOrder?.size * botState.lStateData.lastOrder?.price || config.long.purchaseUsdt;
    const nextUSDTAmount = lastOrderUsdtAmount * (1 + (config.long.size_var / 100));
    const lastPrice = botState.lStateData.lastOrder?.price || currentPrice;
    const nextCoveragePrice = lastPrice * (1 - (config.long.price_var / 100));

    if (currentPrice <= nextCoveragePrice) {
        if (availableUSDT >= nextUSDTAmount && nextUSDTAmount >= MIN_USDT_VALUE_FOR_BITMART) {
            await placeCoverageBuyOrder(botState, creds, nextUSDTAmount, nextCoveragePrice);
        } else {
            autobotCore.log("Fondos insuficientes para la próxima cobertura. Cambiando a NO_COVERAGE.", 'warning');
            await autobotCore.updateBotState('NO_COVERAGE', botState.sstate);
        }
    }
}

module.exports = {
    placeFirstBuyOrder,
    placeSellOrder,
    cancelActiveOrders,
    checkAndPlaceCoverageOrder
};