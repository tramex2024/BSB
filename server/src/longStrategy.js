// BSB/server/src/longStrategy.js

const { placeOrder, getOrderDetails, cancelOrder } = require('../services/bitmartService');
const autobotCore = require('../autobotLogic');
const analyzer = require('../bitmart_indicator_analyzer');
const Autobot = require('../models/Autobot');

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;
const TRAILING_STOP_PERCENTAGE = 0.4;

let botConfiguration = {};
let AUTH_CREDS = {};

function setDependencies(config, creds) {
    botConfiguration = config;
    AUTH_CREDS = creds;
}

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
            // Actualizamos la base de datos con la nueva orden para que el bot la rastree
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
async function handleSuccessfulSell(botStateObj, orderDetails) {
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
    
    if (botConfiguration.long.stopAtCycle) {
        autobotCore.log('stopAtCycle activado. Bot Long se detendrá.', 'info');
        await autobotCore.updateBotState('STOPPED', botStateObj.sstate);
    } else {
        await autobotCore.updateBotState('BUYING', botStateObj.sstate);
        const config = botConfiguration;
        const creds = AUTH_CREDS;
        const purchaseAmount = parseFloat(config.long.purchaseUsdt);
        
        autobotCore.log(`Venta completada. Reiniciando ciclo con una nueva compra a mercado por ${purchaseAmount.toFixed(2)} USDT.`, 'info');
        await placeFirstBuyOrder(config, creds);
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

async function runLongStrategy(autobotState, currentPrice, availableUSDT, availableBTC) {
    switch (autobotState.lstate) {
        case 'RUNNING':
            autobotCore.log("Estado Long: RUNNING. Esperando señal de entrada de COMPRA.", 'info');
            const analysisResult = await analyzer.runAnalysis(currentPrice);
            if (analysisResult.action === 'BUY') {
                autobotCore.log(`¡Señal de COMPRA detectada! Razón: ${analysisResult.reason}`, 'success');
                const purchaseAmount = parseFloat(botConfiguration.long.purchaseUsdt);
                if (availableUSDT >= purchaseAmount && purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART) {
                    await placeFirstBuyOrder(botConfiguration, AUTH_CREDS);
                } else {
                    autobotCore.log(`No hay suficiente USDT para la primera orden. Cambiando a NO_COVERAGE.`, 'warning');
                    await autobotCore.updateBotState('NO_COVERAGE', autobotState.sstate);
                }
            }
            break;

        case 'BUYING':
            autobotCore.log("Estado Long: BUYING. Gestionando compras de cobertura...", 'info');

            await checkAndPlaceCoverageOrder(autobotState, availableUSDT, currentPrice);
            
            const { ppc, ac } = autobotState.lStateData;
            const triggerPercentage = botConfiguration.long.trigger;

            if (ppc > 0 && triggerPercentage > 0) {
                const targetSellPrice = ppc * (1 + (triggerPercentage / 100));
                if (currentPrice >= targetSellPrice && ac > 0) {
                    autobotCore.log(`Precio actual (${currentPrice.toFixed(2)}) alcanzó el objetivo de venta por TRIGGER (${targetSellPrice.toFixed(2)}).`, 'success');
                    
                    if (autobotState.lStateData.lastOrder && autobotState.lStateData.lastOrder.order_id) {
                        await cancelActiveOrders(AUTH_CREDS, autobotState);
                    }
                    
                    await autobotCore.updateBotState('SELLING', autobotState.sstate);
                }
            }
            break;
            
        case 'SELLING':
            autobotCore.log("Estado Long: SELLING. Gestionando ventas...", 'info');
            const { ac: acSelling, pm, pc } = autobotState.lStateData;
            
            autobotState.lStateData.pm = Math.max(pm || 0, currentPrice);
            const newPc = autobotState.lStateData.pm * (1 - (TRAILING_STOP_PERCENTAGE / 100));
            autobotState.lStateData.pc = newPc;

            if (acSelling > 0) {
                if (currentPrice <= newPc) {
                    autobotCore.log(`Condiciones de venta por Trailing Stop alcanzadas. Colocando orden de venta.`, 'success');
                    await placeSellOrder(botConfiguration, AUTH_CREDS, acSelling);
                }
            }
            autobotCore.log(`Esperando condiciones para la venta. Precio actual: ${currentPrice.toFixed(2)}, PM: ${autobotState.lStateData.pm.toFixed(2)}, PC: ${newPc.toFixed(2)}`);
            break;

        case 'NO_COVERAGE':
            autobotCore.log("Estado Long: NO_COVERAGE. Esperando fondos o precio de venta.", 'warning');
            const { ppc: ppcNoCov } = autobotState.lStateData;
            const triggerPercentageNoCov = botConfiguration.long.trigger;

            if (ppcNoCov > 0 && triggerPercentageNoCov > 0) {
                const targetSellPrice = ppcNoCov * (1 + (triggerPercentageNoCov / 100));
                if (currentPrice >= targetSellPrice && (autobotState.lStateData.ac || 0) > 0) {
                    autobotCore.log(`Precio actual (${currentPrice.toFixed(2)}) alcanzó el objetivo de venta por TRIGGER (${targetSellPrice.toFixed(2)}) desde NO_COVERAGE. Transicionando a SELLING.`, 'success');
                    await autobotCore.updateBotState('SELLING', autobotState.sstate);
                }
            }

            if (autobotState.lstate === 'NO_COVERAGE' && availableUSDT >= parseFloat(botConfiguration.long.purchaseUsdt)) {
                autobotCore.log("Fondos recuperados. Volviendo a estado BUYING para intentar la cobertura.", 'success');
                await autobotCore.updateBotState('BUYING', autobotState.sstate);
            }
            break;

        case 'STOPPED':
            autobotCore.log("Estado Long: STOPPED. El bot está inactivo.", 'info');
            break;
    }
}

module.exports = {
    runLongStrategy,
    setDependencies
};