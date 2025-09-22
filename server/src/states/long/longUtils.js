// BSB/server/src/longUtils.js

// Importaciones necesarias
const { placeOrder, getOrderDetails, cancelOrder } = require('../services/bitmartService');
const Autobot = require('../models/Autobot');
const autobotCore = require('../autobotLogic');

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;

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
 * Verifica si se necesita colocar una nueva orden de cobertura y la coloca.
 */
async function checkAndPlaceCoverageOrder(botState, availableUSDT, currentPrice) {
    // 1. Verificamos si ya hay una orden de cobertura abierta
    if (botState.lStateData.lastOrder && botState.lStateData.lastOrder.side === 'buy' && botState.lStateData.lastOrder.order_id) {
        try {
            const orderDetails = await getOrderDetails(AUTH_CREDS, botConfiguration.symbol || TRADE_SYMBOL, botState.lStateData.lastOrder.order_id);
            if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                autobotCore.log(`Ya hay una orden de cobertura activa (ID: ${orderDetails.order_id}). Esperando su ejecución.`, 'info');
                return;
            }
        } catch (error) {
            autobotCore.log(`Error al verificar el estado de la orden ${botState.lStateData.lastOrder.order_id}. ${error.message}`, 'error');
            // Continuamos la ejecución por si la orden ya no existe en el exchange
        }
    }
    
    // 2. Si no hay una orden activa, procedemos a calcular y colocar la siguiente
    const lastOrderUsdtAmount = botState.lStateData.lastOrder?.size * botState.lStateData.lastOrder?.price || botConfiguration.long.purchaseUsdt;
    const nextUSDTAmount = lastOrderUsdtAmount * (1 + (botConfiguration.long.size_var / 100));
    const lastPrice = botState.lStateData.lastOrder?.price || currentPrice;
    const nextCoveragePrice = lastPrice * (1 - (botConfiguration.long.price_var / 100));

    if (currentPrice <= nextCoveragePrice) {
        if (availableUSDT >= nextUSDTAmount && nextUSDTAmount >= MIN_USDT_VALUE_FOR_BITMART) {
            await placeCoverageBuyOrder(botState, AUTH_CREDS, nextUSDTAmount, nextCoveragePrice);
        } else {
            autobotCore.log("Fondos insuficientes para la próxima cobertura. Cambiando a NO_COVERAGE.", 'warning');
            await autobotCore.updateBotState('NO_COVERAGE', botState.sstate);
        }
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

    const SYMBOL = botConfiguration.symbol || TRADE_SYMBOL;
    const orderIdToCancel = botState.lStateData.lastOrder.order_id;
    autobotCore.log(`Intentando cancelar la orden ${orderIdToCancel}.`, 'info');

    try {
        await cancelOrder(creds, SYMBOL, orderIdToCancel);
        autobotCore.log(`Orden ${orderIdToCancel} cancelada exitosamente.`, 'success');
        
        // Limpiamos la orden de la base de datos después de la cancelación
        botState.lStateData.lastOrder = null;
        await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });

    } catch (error) {
        autobotCore.log(`Error al cancelar la orden ${orderIdToCancel}: ${error.message}`, 'error');
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
                        await handleSuccessfulSell(botState, orderDetails);
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

// Exporta las funciones para que puedan ser usadas
module.exports = {
    placeFirstBuyOrder,
    checkAndPlaceCoverageOrder,
    cancelActiveOrders,
    placeSellOrder
};