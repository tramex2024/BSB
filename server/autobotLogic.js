// autobotLogic.js
const bitmartService = require('./services/bitmartService');
const bitmartIndicatorAnalyzer = require('./bitmart_indicator_analyzer'); // Nombre de archivo corregido a snake_case
const BotState = require('./models/BotState'); // Asumo que BotState es un modelo de Mongoose
const { ioInstance } = require('./server'); // Para emitir eventos a través de WebSockets
const { decrypt } = require('./utils/encryption'); // Para desencriptar las claves

const TRADE_SYMBOL = 'BTC_USDT';
const BASE_CURRENCY = 'BTC';
const QUOTE_CURRENCY = 'USDT';

// Función para reiniciar las variables de un ciclo
function resetCycleVariables(botStateObj) {
    botStateObj.ppc = 0;
    botStateObj.cp = 0;
    botStateObj.ac = 0;
    botStateObj.pm = 0;
    botStateObj.pv = 0;
    botStateObj.pc = 0;
    botStateObj.openOrders = [];
    botStateObj.expectedOpenOrders = [];
    botStateObj.cycleProfit = 0;
    botStateObj.orderCountInCycle = 0;
    botStateObj.lastOrderUSDTAmount = 0;
    botStateObj.lastOrder = null;
    botStateObj.nextCoverageUSDTAmount = 0;
    botStateObj.nextCoverageTargetPrice = 0;
    console.log(`[AUTOBOT][${botStateObj.userId}] Variables de ciclo reiniciadas.`);
}

/**
 * Detiene la estrategia del bot, cancela órdenes y guarda el estado.
 * @param {Object} botStateObj - El objeto del estado del bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario (ya desencriptadas).
 */
async function stopBotStrategy(botStateObj, bitmartCreds) {
    console.log(`[AUTOBOT][${botStateObj.userId}] Deteniendo la estrategia del bot...`);
    botStateObj.isRunning = false;
    botStateObj.state = 'STOPPED';
    try {
        if (bitmartCreds && bitmartCreds.apiKey) { // Solo intentar cancelar si hay credenciales válidas
            await bitmartService.cancelAllOpenOrders(bitmartCreds, TRADE_SYMBOL);
            console.log(`[AUTOBOT][${botStateObj.userId}] Todas las órdenes abiertas han sido canceladas.`);
        } else {
            console.warn(`[AUTOBOT][${botStateObj.userId}] No se pudo cancelar órdenes: Credenciales de BitMart no válidas.`);
        }
    } catch (error) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Error al cancelar órdenes al detener el bot:`, error.message);
    }
    await saveBotState(botStateObj);
    if (ioInstance) {
        ioInstance.to(botStateObj.userId).emit('botStateUpdate', { botState: botStateObj.toObject(), userId: botStateObj.userId });
        ioInstance.to(botStateObj.userId).emit('signalUpdate', { signal: 'DETENIDO', userId: botStateObj.userId });
    }
    console.log(`[AUTOBOT][${botStateObj.userId}] Bot detenido y estado guardado.`);
}

/**
 * Guarda el estado del bot en la base de datos.
 * @param {Object} botStateObj - El objeto del estado del bot (instancia del modelo Mongoose).
 */
async function saveBotState(botStateObj) {
    try {
        await botStateObj.save();
        // console.log(`[AUTOBOT][${botStateObj.userId}] Estado del bot guardado en DB.`);
    } catch (error) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Error al guardar el estado del bot en DB:`, error.message);
    }
}

/**
 * Función Principal de Lógica del Bot.
 * @param {Object} botStateObj - El objeto del estado del bot (instancia del modelo Mongoose).
 */
async function runBotLogic(botStateObj) {
    console.log(`\n--- Ejecutando lógica del bot para ${botStateObj.userId}. Estado actual: ${botStateObj.state} ---`);

    // Desencriptar las credenciales de BitMart desde el objeto botStateObj
    let bitmartCreds = null;
    if (botStateObj.bitmartApiKeys && botStateObj.bitmartApiKeys.apiKey && botStateObj.bitmartApiKeys.apiSecret) {
        try {
            bitmartCreds = {
                apiKey: decrypt(botStateObj.bitmartApiKeys.apiKey),
                apiSecret: decrypt(botStateObj.bitmartApiKeys.apiSecret),
                apiMemo: botStateObj.bitmartApiKeys.apiMemo ? decrypt(botStateObj.bitmartApiKeys.apiMemo) : ''
            };
        } catch (decryptError) {
            console.error(`[AUTOBOT][${botStateObj.userId}] Error al desencriptar credenciales de BitMart:`, decryptError.message);
            // Si las credenciales no se pueden desencriptar, detener el bot.
            botStateObj.state = 'STOPPED';
            botStateObj.isRunning = false;
            await saveBotState(botStateObj);
            if (ioInstance) {
                ioInstance.to(botStateObj.userId).emit('botError', { message: 'Error de credenciales: no se pudieron desencriptar. Bot detenido.', userId: botStateObj.userId });
                ioInstance.to(botStateObj.userId).emit('signalUpdate', { signal: 'ERROR_CREDENCIALES', userId: botStateObj.userId });
            }
            return;
        }
    } else {
        console.error(`[AUTOBOT][${botStateObj.userId}] Credenciales de BitMart no encontradas en el estado del bot. Deteniendo el bot.`);
        botStateObj.state = 'STOPPED';
        botStateObj.isRunning = false;
        await saveBotState(botStateObj);
        if (ioInstance) {
            ioInstance.to(botStateObj.userId).emit('botError', { message: 'Credenciales de BitMart no configuradas. Bot detenido.', userId: botStateObj.userId });
            ioInstance.to(botStateObj.userId).emit('signalUpdate', { signal: 'ERROR_CREDENCIALES', userId: botStateObj.userId });
        }
        return;
    }


    try {
        const ticker = await bitmartService.getTicker(TRADE_SYMBOL);
        if (ticker && typeof ticker.last !== 'undefined' && ticker.last !== null) {
            botStateObj.currentPrice = parseFloat(ticker.last);
            console.log(`[AUTOBOT][${botStateObj.userId}] Precio actual de BitMart actualizado: ${botStateObj.currentPrice.toFixed(2)} USDT`);
        } else {
            console.warn(`[AUTOBOT][${botStateObj.userId}] No se pudo obtener el precio actual. Reintentando en el próximo ciclo.`);
            if (ioInstance) {
                ioInstance.to(botStateObj.userId).emit('botError', { message: `Bot para ${botStateObj.userId}: No se pudo obtener el precio actual de ${TRADE_SYMBOL}. Reintentando.`, userId: botStateObj.userId });
            }
            return;
        }

        const balanceInfo = await bitmartService.getBalance(bitmartCreds);
        const usdtBalance = balanceInfo.find(b => b.currency === QUOTE_CURRENCY);
        const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available || 0) : 0;
        const btcBalance = balanceInfo.find(b => b.currency === BASE_CURRENCY);
        const availableBTC = btcBalance ? parseFloat(btcBalance.available || 0) : 0;

        if (ioInstance) {
            ioInstance.to(botStateObj.userId).emit('balanceUpdate', { usdt: availableUSDT, btc: availableBTC, userId: botStateObj.userId });
            ioInstance.to(botStateObj.userId).emit('botStateUpdate', { botState: botStateObj.toObject(), userId: botStateObj.userId });
        }

        let currentSignal = 'HOLD';

        // --- Manejo de Órdenes Abiertas y Detección de Ejecución (Importante para órdenes Límite) ---
        const bitmartOpenOrders = await bitmartService.getOpenOrders(bitmartCreds, TRADE_SYMBOL);
        botStateObj.openOrders = bitmartOpenOrders.orders.filter(order =>
            order.state === 'new' || order.state === 'partially_filled'
        );

        const ordersToCheck = [...botStateObj.expectedOpenOrders || []];
        for (const expectedOrder of ordersToCheck) {
            const orderDetail = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, expectedOrder.orderId);

            if (orderDetail && (orderDetail.state === 'filled' || orderDetail.state === 'fully_filled')) {
                console.log(`[AUTOBOT][${botStateObj.userId}] Orden detectada como LLENA: ${orderDetail.order_id} (Side: ${orderDetail.side}, Price: ${orderDetail.price}, Size: ${orderDetail.filled_size})`);

                if (orderDetail.side === 'buy') {
                    const currentCP = parseFloat(botStateObj.cp || 0);
                    const currentAC = parseFloat(botStateObj.ac || 0);
                    const filledPrice = parseFloat(orderDetail.price);
                    const filledSize = parseFloat(orderDetail.filled_size);

                    const newCP = currentCP + (filledPrice * filledSize);
                    const newAC = currentAC + filledSize;

                    botStateObj.ppc = (newAC > 0) ? (newCP / newAC) : 0;
                    botStateObj.cp = parseFloat(newCP.toFixed(2));
                    botStateObj.ac = parseFloat(newAC.toFixed(8));
                    botStateObj.orderCountInCycle++;
                    botStateObj.lastOrderUSDTAmount = filledPrice * filledSize;
                    botStateObj.lastOrder = {
                        orderId: orderDetail.order_id,
                        price: filledPrice,
                        size: filledSize,
                        side: 'buy',
                        type: orderDetail.type,
                        state: 'filled'
                    };
                    console.log(`[AUTOBOT][${botStateObj.userId}] Compra ${orderDetail.order_id} procesada. Nuevo AC: ${botStateObj.ac.toFixed(8)}, Nuevo CP: ${botStateObj.cp.toFixed(2)}, Nuevo PPC: ${botStateObj.ppc.toFixed(2)}. Órdenes en ciclo: ${botStateObj.orderCountInCycle}`);

                    botStateObj.expectedOpenOrders = botStateObj.expectedOpenOrders.filter(o => o.orderId !== orderDetail.order_id);

                    if (botStateObj.state !== 'BUYING') {
                        botStateObj.state = 'BUYING';
                        console.log(`[AUTOBOT][${botStateObj.userId}] Transicionando a BUYING después de que una compra se llenó.`);
                    }

                } else if (orderDetail.side === 'sell') {
                    const revenueFromSale = parseFloat(orderDetail.price) * parseFloat(orderDetail.filled_size);
                    const commissionRate = 0.001; // Asumir 0.1%
                    const buyCommission = parseFloat((botStateObj.cp || 0) * commissionRate);
                    const sellCommission = revenueFromSale * commissionRate;

                    botStateObj.cycleProfit = parseFloat((revenueFromSale - (botStateObj.cp || 0) - buyCommission - sellCommission).toFixed(2));
                    botStateObj.profit = parseFloat(((botStateObj.profit || 0) + botStateObj.cycleProfit).toFixed(2));

                    console.log(`[AUTOBOT][${botStateObj.userId}] Ciclo ${botStateObj.cycle} completado. Ganancia/Pérdida del ciclo: ${botStateObj.cycleProfit.toFixed(2)} USDT. Ganancia total: ${botStateObj.profit.toFixed(2)} USDT.`);

                    botStateObj.expectedOpenOrders = botStateObj.expectedOpenOrders.filter(o => o.orderId !== orderDetail.order_id);

                    if (botStateObj.stopAtCycleEnd) {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Bandera "Stop on Cycle End" activada. Deteniendo el bot al final del ciclo.`);
                        await stopBotStrategy(botStateObj, bitmartCreds);
                        return;
                    } else {
                        await bitmartService.cancelAllOpenOrders(bitmartCreds, TRADE_SYMBOL, 'buy');
                        resetCycleVariables(botStateObj);
                        botStateObj.cycle++;

                        console.log(`[AUTOBOT][${botStateObj.userId}] Iniciando nuevo ciclo. Colocando primera orden de compra (Market).`);
                        const purchaseAmount = parseFloat(botStateObj.purchase || 0);
                        const firstBuyOrderDetails = await bitmartService.placeFirstBuyOrder(bitmartCreds, TRADE_SYMBOL, purchaseAmount, botStateObj.currentPrice);

                        botStateObj.expectedOpenOrders.push({
                            orderId: firstBuyOrderDetails.orderId,
                            side: 'buy',
                            type: 'market',
                            expectedPrice: firstBuyOrderDetails.price,
                            expectedSize: firstBuyOrderDetails.size
                        });
                        botStateObj.lastOrder = firstBuyOrderDetails;
                        botStateObj.lastOrderUSDTAmount = firstBuyOrderDetails.price * firstBuyOrderDetails.size;
                        botStateObj.state = 'BUYING';
                        console.log(`[AUTOBOT][${botStateObj.userId}] Bot listo para el nuevo ciclo en estado BUYING. Primera orden colocada.`);
                    }
                    return;
                }
            } else if (orderDetail && (orderDetail.state === 'canceled' || orderDetail.state === 'partial_filled_canceled' || orderDetail.state === 'not_found')) {
                console.log(`[AUTOBOT][${botStateObj.userId}] Orden ${orderDetail.order_id} detectada como ${orderDetail.state}. Removiendo del seguimiento.`);
                botStateObj.expectedOpenOrders = botStateObj.expectedOpenOrders.filter(o => o.orderId !== orderDetail.order_id);
            }
        }


        switch (botStateObj.state) {
            case 'RUNNING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: RUNNING. Esperando señal de entrada de BUY desde el analizador de indicadores...`);

                if (parseFloat(botStateObj.ac || 0) > 0) {
                    console.warn(`[AUTOBOT][${botStateObj.userId}] Detectado AC > 0 en estado RUNNING. Transicionando a BUYING para reanudar ciclo.`);
                    botStateObj.state = 'BUYING';
                    break;
                }

                const analysisResult = await bitmartIndicatorAnalyzer.runAnalysis(botStateObj.currentPrice);
                console.log(`[AUTOBOT][${botStateObj.userId}] Analizador de indicadores resultado: ${analysisResult.action} - Razón: ${analysisResult.reason}`);

                if (analysisResult.action === 'BUY') {
                    currentSignal = 'BUY';
                    console.log(`[AUTOBOT][${botStateObj.userId}] ¡Señal de entrada de COMPRA DETECTADA por los indicadores!`);
                    const purchaseAmount = parseFloat(botStateObj.purchase || 0);

                    try {
               //         const orderDetails = await bitmartService.placeFirstBuyOrder(bitmartCreds, TRADE_SYMBOL, purchaseAmount, botStateObj.currentPrice);

                        botStateObj.expectedOpenOrders.push({
                            orderId: orderDetails.orderId,
                            side: 'buy',
                            type: 'market',
                            expectedPrice: orderDetails.price,
                            expectedSize: orderDetails.size
                        });
                        botStateObj.lastOrder = orderDetails;
                        botStateObj.lastOrderUSDTAmount = orderDetails.price * orderDetails.size;
                        botStateObj.state = 'BUYING';
                        console.log(`[AUTOBOT][${botStateObj.userId}] Primera orden de compra (Market) colocada. ID: ${orderDetails.orderId}. Transicionando a BUYING.`);
                    } catch (error) {
                        console.error(`[AUTOBOT][${botStateObj.userId}] Error al intentar colocar la primera orden de compra:`, error.message);
                        if (error.message.includes("Balance insuficiente") || error.message.includes("menor que el mínimo")) {
                            botStateObj.state = 'STOPPED';
                            botStateObj.isRunning = false;
                            console.warn(`[AUTOBOT][${botStateObj.userId}] Deteniendo el bot debido a: ${error.message}`);
                        } else {
                            botStateObj.state = 'RUNNING';
                        }
                    }
                } else if (analysisResult.action === 'SELL') {
                    currentSignal = 'HOLD';
                    console.log(`[AUTOBOT][${botStateObj.userId}] Indicador sugiere VENTA, pero no hay activo (AC = 0). Manteniendo HOLD.`);
                } else {
                    currentSignal = 'HOLD';
                    console.log(`[AUTOBOT][${botStateObj.userId}] Esperando una señal de COMPRA de los indicadores.`);
                }
                break;

            case 'BUYING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: BUYING. Gestionando compras y coberturas...`);
                console.log(`[AUTOBOT][${botStateObj.userId}] PPC: ${parseFloat(botStateObj.ppc || 0).toFixed(2)}, CP: ${parseFloat(botStateObj.cp || 0).toFixed(2)}, AC: ${parseFloat(botStateObj.ac || 0).toFixed(8)} BTC`);
                console.log(`[AUTOBOT][${botStateObj.userId}] Órdenes abiertas esperadas: ${botStateObj.expectedOpenOrders.length}`);

                currentSignal = 'BUY';

                const hasOpenSellOrder = botStateObj.expectedOpenOrders.some(o => o.side === 'sell');

                if (parseFloat(botStateObj.ac || 0) > 0 && !hasOpenSellOrder) {
                    const ppcValue = parseFloat(botStateObj.ppc || 0);
                    const triggerPercentage = parseFloat(botStateObj.trigger || 0);

                    if (ppcValue > 0 && triggerPercentage > 0) {
                        const targetSellPriceTrigger = ppcValue * (1 + (triggerPercentage / 100));
                        console.log(`[AUTOBOT][${botStateObj.userId}] Evaluando venta por TRIGGER. Precio objetivo: ${targetSellPriceTrigger.toFixed(2)} USDT. Precio actual: ${botStateObj.currentPrice.toFixed(2)} USDT.`);

                        if (botStateObj.currentPrice >= targetSellPriceTrigger) {
                            console.log(`[AUTOBOT][${botStateObj.userId}] Precio actual (${botStateObj.currentPrice.toFixed(2)} USDT) alcanzó o superó el objetivo de venta por TRIGGER (${targetSellPriceTrigger.toFixed(2)} USDT). Transicionando a SELLING.`);
                            botStateObj.state = 'SELLING';
                            currentSignal = 'SELL';
                            break;
                        }
                    }
                }

                const hasOpenBuyLimitOrder = botStateObj.expectedOpenOrders.some(o => o.side === 'buy' && o.type === 'limit');
                if (!hasOpenBuyLimitOrder) {
                    let nextUSDTAmount;
                    const lastUSDTAmount = parseFloat(botStateObj.lastOrderUSDTAmount || botStateObj.purchase || 0);

                    const incrementFactor = parseFloat(botStateObj.increment || 100) / 100;
                    nextUSDTAmount = lastUSDTAmount * (1 + incrementFactor);
                    nextUSDTAmount = parseFloat(nextUSDTAmount.toFixed(2));

                    const lastOrderPrice = parseFloat(botStateObj.lastOrder?.price || botStateObj.currentPrice || 0);
                    const currentDecrementPercentage = parseFloat(botStateObj.decrement || 1) / 100;
                    const orderFactor = botStateObj.orderCountInCycle > 0 ? botStateObj.orderCountInCycle : 1;
                    const totalDecrementApplied = currentDecrementPercentage * orderFactor;
                    const nextCoveragePrice = lastOrderPrice * (1 - totalDecrementApplied);
                    const roundedNextCoveragePrice = parseFloat(nextCoveragePrice.toFixed(2));

                    console.log(`[DEBUG_COVERAGE] Próximo monto USDT: ${nextUSDTAmount.toFixed(2)}, Precio de última orden: ${lastOrderPrice.toFixed(2)}.`);
                    console.log(`[DEBUG_COVERAGE] Decremento acumulativo: ${totalDecrementApplied * 100}%. Precio para próxima cobertura: ${roundedNextCoveragePrice.toFixed(2)} USDT.`);


                    if (availableUSDT < nextUSDTAmount || nextUSDTAmount < bitmartService.MIN_USDT_VALUE_FOR_BITMART) {
                        if (botStateObj.state !== 'NO_COVERAGE') {
                            console.warn(`[AUTOBOT][${botStateObj.userId}] Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto (${nextUSDTAmount.toFixed(2)} USDT) es menor al mínimo para la próxima orden de cobertura. Cambiando a NO_COVERAGE.`);
                            botStateObj.state = 'NO_COVERAGE';
                            botStateObj.nextCoverageUSDTAmount = nextUSDTAmount;
                            botStateObj.nextCoverageTargetPrice = roundedNextCoveragePrice;
                            currentSignal = 'HOLD';
                        }
                    } else {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Colocando orden de cobertura sin esperar que el precio baje.`);
                        botStateObj.nextCoverageUSDTAmount = nextUSDTAmount;
                        botStateObj.nextCoverageTargetPrice = roundedNextCoveragePrice;

                        try {
                            const orderDetails = await bitmartService.placeCoverageBuyOrder(bitmartCreds, TRADE_SYMBOL, nextUSDTAmount, roundedNextCoveragePrice);

                            botStateObj.expectedOpenOrders.push({
                                orderId: orderDetails.orderId,
                                price: orderDetails.price,
                                size: orderDetails.size,
                                side: 'buy',
                                type: 'limit',
                                state: 'new'
                            });
                            console.log(`[AUTOBOT][${botStateObj.userId}] Orden de cobertura (Limit) ID: ${orderDetails.orderId} COLOCADA a ${orderDetails.price.toFixed(2)} USDT. Esperando ejecución.`);
                        } catch (error) {
                            console.error(`[AUTOBOT][${botStateObj.userId}] Error al intentar colocar orden de cobertura:`, error.message);
                            if (error.message.includes("Balance insuficiente") || error.message.includes("menor al mínimo")) {
                                botStateObj.state = 'NO_COVERAGE';
                                console.warn(`[AUTOBOT][${botStateObj.userId}] Cambiando a NO_COVERAGE debido a: ${error.message}`);
                            } else {
                                console.error(`[AUTOBOT][${botStateObj.userId}] Error no crítico al colocar orden de cobertura. Reintentando en el siguiente ciclo.`);
                            }
                        }
                    }
                } else {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Ya hay una orden de compra de cobertura pendiente. Esperando su ejecución o la condición de venta.`);
                    currentSignal = 'HOLD';
                }
                break;

            case 'SELLING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: SELLING. Gestionando ventas...`);
                currentSignal = 'SELL';

                botStateObj.pm = Math.max(parseFloat(botStateObj.pm || 0), parseFloat(botStateObj.currentPrice || 0));
                botStateObj.pv = parseFloat((parseFloat(botStateObj.ppc || 0) * (1 + (parseFloat(botStateObj.trigger || 0) / 100))).toFixed(2));
                botStateObj.pc = parseFloat((botStateObj.pm * (1 - 0.004)).toFixed(2));

                console.log(`[AUTOBOT][${botStateObj.userId}] PM: ${botStateObj.pm.toFixed(2)}, PV: ${botStateObj.pv.toFixed(2)}, PC: ${botStateObj.pc.toFixed(2)}`);

                const hasOpenSellOrderInSelling = botStateObj.expectedOpenOrders.some(o => o.side === 'sell');

                if (parseFloat(botStateObj.ac || 0) > 0) {
                    if (botStateObj.currentPrice <= botStateObj.pc && !hasOpenSellOrderInSelling) {
                        console.log(`[AUTOBOT][${botStateObj.userId}] El precio actual (${botStateObj.currentPrice.toFixed(2)}) ha alcanzado el PC (${botStateObj.pc.toFixed(2)}). Colocando orden de venta Límite al PV (${botStateObj.pv.toFixed(2)}).`);
                        try {
                            const orderDetails = await bitmartService.placeSellOrder(bitmartCreds, TRADE_SYMBOL, parseFloat(botStateObj.ac), botStateObj.pv);
                            botStateObj.expectedOpenOrders.push({
                                orderId: orderDetails.orderId,
                                price: orderDetails.price,
                                size: orderDetails.size,
                                side: 'sell',
                                type: 'limit',
                                state: 'new'
                            });
                            console.log(`[AUTOBOT][${botStateObj.userId}] Orden de venta (Limit) ID: ${orderDetails.orderId} COLOCADA a ${orderDetails.price.toFixed(2)} USDT. Esperando ejecución.`);
                        } catch (error) {
                            console.error(`[AUTOBOT][${botStateObj.userId}] Error al intentar colocar la orden de venta:`, error.message);
                            botStateObj.state = 'SELLING';
                        }
                    } else if (hasOpenSellOrderInSelling) {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Ya hay una orden de venta pendiente. Esperando su ejecución.`);
                    } else {
                         console.log(`[AUTOBOT][${botStateObj.userId}] Precio actual (${botStateObj.currentPrice.toFixed(2)}) aún no ha alcanzado el PC (${botStateObj.pc.toFixed(2)}).`);
                    }
                } else {
                    console.log(`[AUTOBOT][${botStateObj.userId}] No hay AC para vender en estado SELLING. Esto es anómalo.`);
                    if (botStateObj.expectedOpenOrders.length === 0) {
                        console.log(`[AUTOBOT][${botStateObj.userId}] AC es 0 y no hay órdenes abiertas. Reiniciando ciclo.`);
                        if (botStateObj.stopAtCycleEnd) {
                            await stopBotStrategy(botStateObj, bitmartCreds);
                        } else {
                            resetCycleVariables(botStateObj);
                            botStateObj.cycle++;
                            const purchaseAmount = parseFloat(botStateObj.purchase || 0);
                            const firstBuyOrderDetails = await bitmartService.placeFirstBuyOrder(bitmartCreds, TRADE_SYMBOL, purchaseAmount, botStateObj.currentPrice);
                            botStateObj.expectedOpenOrders.push({
                                orderId: firstBuyOrderDetails.orderId,
                                side: 'buy',
                                type: 'market',
                                expectedPrice: firstBuyOrderDetails.price,
                                expectedSize: firstBuyOrderDetails.size
                            });
                            botStateObj.lastOrder = firstBuyOrderDetails;
                            botStateObj.lastOrderUSDTAmount = firstBuyOrderDetails.price * firstBuyOrderDetails.size;
                            botStateObj.state = 'BUYING';
                        }
                    }
                }
                break;

            case 'NO_COVERAGE':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: NO_COVERAGE. Esperando fondos para la próxima orden de ${parseFloat(botStateObj.nextCoverageUSDTAmount || 0).toFixed(2)} USDT @ ${parseFloat(botStateObj.nextCoverageTargetPrice || 0).toFixed(2)}. O esperando venta por TRIGGER.`);
                currentSignal = 'HOLD';

                if (parseFloat(botStateObj.ac || 0) > 0 && !botStateObj.expectedOpenOrders.some(o => o.side === 'sell')) {
                    const ppcValue = parseFloat(botStateObj.ppc || 0);
                    const triggerPercentage = parseFloat(botStateObj.trigger || 0);

                    if (ppcValue > 0 && triggerPercentage > 0) {
                        const targetSellPriceTrigger = ppcValue * (1 + (triggerPercentage / 100));
                        console.log(`[AUTOBOT][${botStateObj.userId}] Venta por TRIGGER. Precio objetivo: ${targetSellPriceTrigger.toFixed(2)} USDT. Precio actual: ${botStateObj.currentPrice.toFixed(2)} USDT.`);

                        if (botStateObj.currentPrice >= targetSellPriceTrigger) {
                            console.log(`[AUTOBOT][${botStateObj.userId}] Precio actual (${botStateObj.currentPrice.toFixed(2)} USDT) alcanzó o superó el objetivo de venta por TRIGGER (${targetSellPriceTrigger.toFixed(2)} USDT) desde NO_COVERAGE.`);
                            botStateObj.state = 'SELLING';
                            currentSignal = 'SELL';
                            break;
                        }
                    } else {
                        console.warn(`[AUTOBOT][${botStateObj.userId}] PPC (${ppcValue}) o TRIGGER (${triggerPercentage}) inválidos en NO_COVERAGE. No se puede evaluar la condición de venta por TRIGGER.`);
                    }
                }

                if (botStateObj.state === 'NO_COVERAGE') {
                    const nextBuyAmount = parseFloat(botStateObj.nextCoverageUSDTAmount || 0);
                    if (availableUSDT >= nextBuyAmount && nextBuyAmount >= bitmartService.MIN_USDT_VALUE_FOR_BITMART) {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Fondos disponibles. Volviendo a estado BUYING para que se intente la orden de cobertura.`);
                        botStateObj.state = 'BUYING';
                    }
                }
                break;

            case 'STOPPED':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: STOPPED. El bot está inactivo.`);
                currentSignal = 'DETENIDO';
                break;
            default:
                console.warn(`[AUTOBOT][${botStateObj.userId}] Estado desconocido del bot: ${botStateObj.state}. Estableciendo a STOPPED.`);
                botStateObj.state = 'STOPPED';
                currentSignal = 'DETENIDO';
                break;
        }

        if (ioInstance) {
            ioInstance.to(botStateObj.userId).emit('signalUpdate', { signal: currentSignal, userId: botStateObj.userId });
            console.log(`[AUTOBOT][${botStateObj.userId}] Señal emitida al frontend: ${currentSignal}`);
        }

        await saveBotState(botStateObj);

    } catch (error) {
        console.error(`❌ Falló la ejecución de la lógica del bot para ${botStateObj.userId}:`, error.message);
        if (error.message.includes('Credenciales de BitMart API') || error.message.includes('API keys not configured')) {
            console.error(`[AUTOBOT][${botStateObj.userId}] Credenciales de BitMart inválidas o no configuradas. Deteniendo el bot.`);
            if (botStateObj) {
                botStateObj.state = 'STOPPED';
                botStateObj.isRunning = false;
                await saveBotState(botStateObj);
                if (ioInstance) {
                    ioInstance.to(botStateObj.userId).emit('botError', { message: 'Credenciales de BitMart inválidas o no configuradas. Bot detenido.', userId: botStateObj.userId });
                    ioInstance.to(botStateObj.userId).emit('signalUpdate', { signal: 'ERROR_CREDENCIALES', userId: botStateObj.userId });
                }
            }
        } else {
            console.error(`[AUTOBOT][${botStateObj.userId}] Error inesperado: ${error.message}. El bot intentará continuar en el próximo ciclo.`);
            if (ioInstance) {
                ioInstance.to(botStateObj.userId).emit('botError', { message: `Error inesperado: ${error.message}. Bot intentando continuar.`, userId: botStateObj.userId });
                ioInstance.to(botStateObj.userId).emit('signalUpdate', { signal: 'ERROR_INESPERADO', userId: botStateObj.userId });
            }
        }
        if (botStateObj) {
            await saveBotState(botStateObj);
        }
    }
}

module.exports = {
    runBotLogic,
    stopBotStrategy,
};