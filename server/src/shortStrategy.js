// BSB/server/src/shortStrategy.js

const { placeOrder, getOrderDetails } = require('../services/bitmartService');
const autobotCore = require('../autobotLogic');
const analyzer = require('./bitmart_indicator_analyzer');
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
 * Coloca la primera orden de venta del ciclo Short.
 * @param {object} config - Configuración del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {number} sellAmount - Cantidad de BTC a vender.
 */
async function placeFirstSellOrder(config, creds, sellAmount) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    autobotCore.log(`Colocando la primera orden de venta a mercado por ${sellAmount.toFixed(8)} BTC.`, 'info');
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
                // Si la orden no se completa, registrar el error y regresar al estado RUNNING
                autobotCore.log(`La orden inicial ${order.order_id} no se completó. Estado: ${orderDetails?.state || 'desconocido'}. Volviendo al estado RUNNING.`, 'error');
                const botState = await Autobot.findOne({});
                if (botState) {
                    await autobotCore.updateBotState(botState.lstate, 'RUNNING');
                }
            }
        }, 10000);
    } else {
        autobotCore.log('Error: La respuesta de la orden de venta no contiene un ID. Volviendo al estado RUNNING.', 'error');
        const botState = await Autobot.findOne({});
        if (botState) {
            await autobotCore.updateBotState(botState.lstate, 'RUNNING');
        }
    }
}

/**
 * Lógica para manejar una orden de venta exitosa (primera venta o cobertura).
 * @param {object} botStateObj - Objeto de estado del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart.
 */
async function handleSuccessfulSell(botStateObj, orderDetails) {
    autobotCore.log(`Orden de venta exitosa. ID: ${orderDetails.order_id}`, 'success');

    botStateObj.sStateData.lastOrder = {
        order_id: orderDetails.order_id,
        price: parseFloat(orderDetails.price),
        size: parseFloat(orderDetails.size),
        side: 'sell',
        state: 'filled'
    };

    const newSize = parseFloat(orderDetails.size);
    const newPrice = parseFloat(orderDetails.price);

    const currentAV = botStateObj.sStateData.av || 0;
    const currentPPV = botStateObj.sStateData.ppv || 0;
    const currentOrderCount = botStateObj.sStateData.orderCountInCycle || 0;

    const totalUSDT = (currentAV * currentPPV) + (newSize * newPrice);
    botStateObj.sStateData.av = currentAV + newSize;
    botStateObj.sStateData.ppv = totalUSDT / botStateObj.sStateData.av;
    botStateObj.sStateData.orderCountInCycle = currentOrderCount + 1;
    
    const lastOrderBtcAmount = botStateObj.sStateData.lastOrder?.size || botConfiguration.short.sellBtc;
    const nextBTCAmount = lastOrderBtcAmount * (1 + (botConfiguration.short.size_var / 100));
    const nextCoveragePrice = newPrice * (1 + (botConfiguration.short.price_var / 100));

    if (botStateObj.sStateData.orderCountInCycle < botConfiguration.short.maxOrders) {
         if (botConfiguration.amountBTC >= nextBTCAmount && (nextBTCAmount * newPrice) >= MIN_USDT_VALUE_FOR_BITMART) {
              autobotCore.log(`Orden anterior completada. Colocando nueva orden de cobertura en ${nextCoveragePrice.toFixed(2)} USDT por ${nextBTCAmount.toFixed(8)} BTC.`, 'info');
              // Aquí se colocaría la orden límite real
         } else {
              autobotCore.log(`Balance insuficiente o monto de orden muy bajo para la próxima cobertura. Cambiando a NO_COVERAGE.`, 'warning');
              await autobotCore.updateBotState(botStateObj.lstate, 'NO_COVERAGE');
         }
    } else {
        autobotCore.log('Límite máximo de órdenes de cobertura alcanzado.', 'warning');
    }

    await Autobot.findOneAndUpdate({}, { 'sStateData': botStateObj.sStateData });
    await autobotCore.updateBotState(botStateObj.lstate, 'SELLING');
}

/**
 * Lógica para manejar una orden de recompra exitosa (para cerrar la posición).
 * @param {object} botStateObj - Objeto de estado del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart.
 */
async function handleSuccessfulBuy(botStateObj, orderDetails) {
    autobotCore.log(`Orden de recompra exitosa. ID: ${orderDetails.order_id}`, 'success');

    botStateObj.sStateData = {
        ppv: 0,
        av: 0,
        orderCountInCycle: 0,
        lastOrder: null,
        pv: 0,
        pc: 0
    };

    await Autobot.findOneAndUpdate({}, { 'sStateData': botStateObj.sStateData });

    if (botConfiguration.short.stopAtCycle) {
        autobotCore.log('stopAtCycle activado. Bot Short se detendrá.', 'info');
        await autobotCore.updateBotState(botStateObj.lstate, 'STOPPED');
    } else {
        await autobotCore.updateBotState(botStateObj.lstate, 'SELLING');
        const config = botConfiguration;
        const creds = AUTH_CREDS;
        const sellAmount = parseFloat(config.short.sellBtc);
        const SYMBOL = config.symbol || TRADE_SYMBOL;

        autobotCore.log(`Recompra completada. Reiniciando ciclo con una nueva venta a mercado por ${sellAmount.toFixed(8)} BTC.`, 'info');
        await placeFirstSellOrder(config, creds, sellAmount);
    }
}

/**
 * Bucle de la estrategia Short.
 * @param {object} autobotState - El estado actual del bot de la base de datos.
 * @param {number} currentPrice - El precio actual del activo.
 * @param {number} availableUSDT - Balance disponible de USDT.
 * @param {number} availableBTC - Balance disponible de BTC.
 */
async function runShortStrategy(autobotState, currentPrice, availableUSDT, availableBTC) {
    switch (autobotState.sstate) {
        case 'RUNNING':
            autobotCore.log("Estado Short: RUNNING. Esperando señal de entrada de VENTA.", 'info');
            const analysisResult = await analyzer.runAnalysis(currentPrice);

            if (analysisResult.action === 'SELL') {
                autobotCore.log(`¡Señal de VENTA detectada! Razón: ${analysisResult.reason}`, 'success');
                const sellAmount = botConfiguration.short.sellBtc;

                if (availableBTC >= sellAmount && (sellAmount * currentPrice) >= MIN_USDT_VALUE_FOR_BITMART) {
                    await placeFirstSellOrder(botConfiguration, AUTH_CREDS, sellAmount);
                } else {
                    autobotCore.log(`No hay suficiente BTC para la primera venta. Cambiando a NO_COVERAGE.`, 'warning');
                    await autobotCore.updateBotState(autobotState.lstate, 'NO_COVERAGE');
                }
            }
            break;

        case 'SELLING':
            autobotCore.log("Estado Short: SELLING. Gestionando ventas de cobertura...", 'info');
            const { ppv, av } = autobotState.sStateData;
            const triggerPercentage = botConfiguration.short.trigger;

            if (ppv > 0 && triggerPercentage > 0) {
                const targetBuyPrice = ppv * (1 - (triggerPercentage / 100));
                if (currentPrice <= targetBuyPrice && av > 0) {
                    autobotCore.log(`Precio actual (${currentPrice.toFixed(2)}) alcanzó el objetivo de recompra por TRIGGER (${targetBuyPrice.toFixed(2)}).`, 'success');
                    await autobotCore.updateBotState(autobotState.lstate, 'BUYING');
                }
            }
            break;

        case 'BUYING':
            autobotCore.log("Estado Short: BUYING. Gestionando recompras...", 'info');
            const { av: avBuying, pv, pc } = autobotState.sStateData;
            
            autobotState.sStateData.pv = Math.min(pv || currentPrice, currentPrice);
            const newPc = autobotState.sStateData.pv * (1 + (TRAILING_STOP_PERCENTAGE / 100));
            autobotState.sStateData.pc = newPc;

            if (avBuying > 0) {
                if (currentPrice >= newPc) {
                    autobotCore.log(`Condiciones de recompra por Trailing Stop alcanzadas. Colocando orden de recompra.`, 'success');
                    // placeBuyOrder
                }
            }
            autobotCore.log(`Esperando condiciones para la recompra. Precio actual: ${currentPrice.toFixed(2)}, PV: ${autobotState.sStateData.pv.toFixed(2)}, PC: ${newPc.toFixed(2)}`);
            break;

        case 'NO_COVERAGE':
            autobotCore.log("Estado Short: NO_COVERAGE. Esperando fondos o precio de recompra.", 'warning');
            const { ppv: ppvNoCov } = autobotState.sStateData;
            const triggerPercentageNoCov = botConfiguration.short.trigger;

            if (ppvNoCov > 0 && triggerPercentageNoCov > 0) {
                const targetBuyPrice = ppvNoCov * (1 - (triggerPercentageNoCov / 100));
                if (currentPrice <= targetBuyPrice && (autobotState.sStateData.av || 0) > 0) {
                    autobotCore.log(`Precio actual (${currentPrice.toFixed(2)}) alcanzó el objetivo de recompra por TRIGGER (${targetBuyPrice.toFixed(2)}) desde NO_COVERAGE. Transicionando a BUYING.`, 'success');
                    await autobotCore.updateBotState(autobotState.lstate, 'BUYING');
                }
            }

            if (autobotState.sstate === 'NO_COVERAGE' && availableBTC >= botConfiguration.short.sellBtc) {
                 autobotCore.log("Fondos recuperados. Volviendo a estado SELLING para intentar la cobertura.", 'success');
                 await autobotCore.updateBotState(autobotState.lstate, 'SELLING');
             }
            break;

        case 'STOPPED':
            autobotCore.log("Estado Short: STOPPED. La estrategia Short está inactiva.", 'info');
            break;
    }
}

module.exports = {
    runShortStrategy,
    setDependencies
};