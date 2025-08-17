// longStrategy.js

const { placeOrder, getOrderDetails } = require('../services/bitmartService');
const autobotCore = require('../autobotLogic');
const analyzer = require('../bitmart_indicator_analyzer');
const Autobot = require('../models/Autobot');

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;
const TRAILING_STOP_PERCENTAGE = 0.4;

let botConfiguration = {};
let AUTH_CREDS = {};
let activeBotOrders = [];

function setDependencies(config, creds, orders) {
    botConfiguration = config;
    AUTH_CREDS = creds;
    activeBotOrders = orders;
}

/**
 * Coloca una orden de compra de cobertura a mercado.
 * @param {object} botState - Estado actual del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {number} usdtAmount - Cantidad de USDT para la orden.
 * @param {number} nextCoveragePrice - Precio límite de la orden.
 */
async function placeCoverageBuyOrder(botState, creds, usdtAmount, nextCoveragePrice) {
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    autobotCore.log(`Colocando orden de cobertura por ${usdtAmount.toFixed(2)} USDT en el precio ${nextCoveragePrice.toFixed(2)}.`, 'info');
    
    // Aquí se colocaría la orden límite en BitMart
    // const order = await placeOrder(creds, SYMBOL, 'buy', 'limit', usdtAmount, nextCoveragePrice);
    
    // Simulación de orden exitosa para la lógica
    const order = { order_id: `simulated_buy_${Date.now()}` };

    if (order && order.order_id) {
        activeBotOrders.push(order.order_id);
        autobotCore.log(`Orden de cobertura colocada. ID: ${order.order_id}. Esperando confirmación...`, 'success');
        
        setTimeout(async () => {
            // En una implementación real, se verificaría el estado de la orden
            const freshBotState = await Autobot.findOne({});
            if (freshBotState) {
                // Simulación de los detalles de la orden completada
                const orderDetails = {
                    order_id: order.order_id,
                    price: nextCoveragePrice,
                    size: usdtAmount / nextCoveragePrice,
                    state: 'filled'
                };
                await handleSuccessfulBuy(freshBotState, orderDetails);
            }
        }, 10000);
    } else {
        autobotCore.log('Error: La respuesta de la orden de cobertura no contiene un ID.', 'error');
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
    
    const lastOrderUsdtAmount = botStateObj.lStateData.lastOrder?.size * botStateObj.lStateData.lastOrder?.price || botConfiguration.long.purchaseUsdt;
    const nextUSDTAmount = lastOrderUsdtAmount * (1 + (botConfiguration.long.size_var / 100));
    const nextCoveragePrice = newPrice * (1 - (botConfiguration.long.price_var / 100));

    if (botStateObj.lStateData.orderCountInCycle < botConfiguration.long.maxOrders) {
        if (botConfiguration.amountUSDT >= nextUSDTAmount && nextUSDTAmount >= MIN_USDT_VALUE_FOR_BITMART) {
             autobotCore.log(`Orden anterior completada. Colocando nueva orden de cobertura en ${nextCoveragePrice.toFixed(2)} USDT por ${nextUSDTAmount.toFixed(2)} USDT.`, 'info');
             // Aquí se colocaría la orden límite real
        } else {
             autobotCore.log(`Balance insuficiente o monto de orden muy bajo para la próxima cobertura. Cambiando a NO_COVERAGE.`, 'warning');
             await autobotCore.updateBotState('NO_COVERAGE', botStateObj.sstate);
        }
    } else {
        autobotCore.log('Límite máximo de órdenes de cobertura alcanzado.', 'warning');
    }

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
    const order = await placeOrder(creds, SYMBOL, 'buy', 'market', purchaseAmount);
    
    if (order && order.order_id) {
        activeBotOrders.push(order.order_id);
        autobotCore.log(`Orden de compra colocada. ID: ${order.order_id}. Esperando confirmación...`, 'success');
        
        setTimeout(async () => {
            const orderDetails = await getOrderDetails(creds, SYMBOL, order.order_id);
            if (orderDetails && orderDetails.state === 'filled') {
                const botState = await Autobot.findOne({});
                if (botState) {
                    await handleSuccessfulBuy(botState, orderDetails);
                }
            } else {
                // Si la orden no se completa, registrar el error y regresar al estado RUNNING
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
}

async function placeSellOrder(config, creds, sellAmount) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    autobotCore.log(`Colocando orden de venta a mercado por ${sellAmount.toFixed(8)} BTC.`, 'info');
    const order = await placeOrder(creds, SYMBOL, 'sell', 'market', sellAmount);

    if (order && order.order_id) {
        activeBotOrders.push(order.order_id);
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
}

async function runLongStrategy(autobotState, currentPrice, availableUSDT, availableBTC) {
    switch (autobotState.lstate) {
        case 'RUNNING':
            autobotCore.log("Estado Long: RUNNING. Esperando señal de entrada de COMPRA.", 'info');
            const analysisResult = await analyzer.runAnalysis(currentPrice);
            if (analysisResult.action === 'BUY') {
                autobotCore.log(`¡Señal de COMPRA detectada! Razón: ${analysisResult.reason}`, 'success');
                const purchaseAmount = botConfiguration.long.purchaseUsdt;
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
            const { ppc, ac } = autobotState.lStateData;
            const triggerPercentage = botConfiguration.long.trigger;

            if (ppc > 0 && triggerPercentage > 0) {
                const targetSellPrice = ppc * (1 + (triggerPercentage / 100));
                if (currentPrice >= targetSellPrice && ac > 0) {
                    autobotCore.log(`Precio actual (${currentPrice.toFixed(2)}) alcanzó el objetivo de venta por TRIGGER (${targetSellPrice.toFixed(2)}).`, 'success');
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

            if (autobotState.lstate === 'NO_COVERAGE' && availableUSDT >= botConfiguration.long.purchaseUsdt) {
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