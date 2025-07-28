// server/autobotLogic.js (ACTUALIZADO)
// Este archivo contiene toda la lógica central del bot de trading,
// refactorizada para manejar el estado del bot por usuario.

const bitmartService = require('./services/bitmartService'); // Asegúrate de que esta ruta sea correcta
const BotState = require('./models/BotState'); // Importar el modelo BotState
const axios = require('axios'); // Necesitaremos axios si implementas indicadores reales

// ¡IMPORTA TU ANALIZADOR DE INDICADORES AQUÍ!
const bitmartIndicatorAnalyzer = require('./bitmart_indicator_analyzer');

// --- CONSTANTES DEL BOT ---
const TRADE_SYMBOL = 'BTC_USDT'; // Define el símbolo para las operaciones del bot
const MIN_USDT_VALUE_FOR_BITMART = 5; // Valor mínimo de USDT para una orden en BitMart
const BASE_CURRENCY = 'BTC'; // La moneda que operas
const QUOTE_CURRENCY = 'USDT'; // La moneda base para los cálculos de profit/purchase

// Referencia global para Socket.IO (se inyectará desde server.js)
let ioInstance;

// Función para inyectar la instancia de Socket.IO
function init(io) {
    ioInstance = io;
    console.log('[AUTOBOT] Socket.IO instance attached to autobotLogic.');
}

// --- Funciones de Persistencia del Estado del Bot (por usuario) ---

/**
 * Carga el estado del bot para un usuario específico desde la base de datos.
 * Si no existe, crea y devuelve un nuevo estado con valores predeterminados.
 * @param {string} userId - El ID del usuario.
 * @returns {BotState} El documento del estado del bot para el usuario.
 */
async function loadBotStateForUser(userId) {
    try {
        let botState = await BotState.findOne({ userId });

        if (!botState) {
            console.log(`[DB] No se encontró estado de bot guardado para el usuario ${userId}. Creando uno nuevo con valores por defecto.`);
            botState = new BotState({ userId }); // Crea una nueva instancia con el userId
            await botState.save();
            console.log(`[DB] Nuevo estado de bot por defecto guardado para ${userId}.`);
        } else {
            console.log(`[DB] Estado de bot cargado desde la base de datos para el usuario ${userId}.`);
        }

        // Aseguramos que el intervalo no esté corriendo al cargar.
        // Si el bot estaba en RUNNING antes de un reinicio del servidor, lo ponemos en STOPPED
        // para que el usuario lo inicie manualmente.
        if (botState.strategyIntervalId) {
            clearInterval(botState.strategyIntervalId);
            botState.strategyIntervalId = null;
            // Si el bot fue detenido por un reinicio, actualiza su estado a STOPPED en la DB.
            if (botState.state === 'RUNNING' || botState.state === 'BUYING' || botState.state === 'SELLING' || botState.state === 'NO_COVERAGE') {
                botState.state = 'STOPPED';
                botState.isRunning = false; // Asegurar que isRunning también se establece en false
                await botState.save(); // Guarda el cambio de estado en la DB
                console.warn(`[DB] Bot de ${userId} estaba en estado activo. Se ha reiniciado en STOPPED y actualizado en DB. Por favor, inícielo manualmente.`);
            }
        }

        // Si el bot se carga con activo comprado (AC > 0), pero está en estado 'STOPPED' o 'RUNNING',
        // significa que un ciclo quedó a medias y el servidor se reinició.
        // Lo movemos a BUYING para que la lógica de gestión de ciclo continúe en el próximo `runBotLogic` si se inicia.
        if (parseFloat(botState.ac || 0) > 0 && (botState.state === 'RUNNING' || botState.state === 'STOPPED')) {
            console.warn(`[DB] Bot de ${userId} cargado en estado ${botState.state} con AC > 0. Sugiriendo transición a BUYING para reanudar ciclo.`);
            // No cambiamos el estado en la DB aquí, solo al iniciar la estrategia.
        }

        return botState;
    } catch (error) {
        console.error(`❌ Error cargando estado del bot para el usuario ${userId} desde DB:`, error.message);
        // Si hay un error, devuelve un estado por defecto para evitar que la aplicación falle.
        return new BotState({ userId });
    }
}

/**
 * Guarda el estado del bot en la base de datos.
 * @param {Object} botStateObj - El objeto del estado del bot a guardar.
 */
async function saveBotState(botStateObj) {
    try {
        // Asegúrate de no guardar strategyIntervalId en la DB si es un campo temporal
        const stateToSave = { ...botStateObj.toObject() }; // Convertir a objeto plano para evitar problemas de Mongoose
        delete stateToSave.strategyIntervalId;

        await BotState.findOneAndUpdate(
            { userId: botStateObj.userId },
            stateToSave,
            { upsert: true, new: true } // Actualiza o crea, y devuelve el documento actualizado
        );
        console.log(`[DB] Estado del bot guardado para el usuario ${botStateObj.userId}.`);
    } catch (error) {
        console.error(`❌ Error guardando estado del bot para ${botStateObj.userId} en DB:`, error.message);
    }
}

// --- Funciones para resetear las variables del ciclo ---
/**
 * Resetea las variables de un ciclo para un objeto de estado del bot dado.
 * @param {Object} botStateObj - El objeto del estado del bot a resetear.
 */
function resetCycleVariables(botStateObj) {
    console.log(`[AUTOBOT] Reseteando variables del ciclo para usuario ${botStateObj.userId}.`);
    botStateObj.ppc = 0;
    botStateObj.cp = 0;
    botStateObj.ac = 0;
    botStateObj.pm = 0;
    botStateObj.pv = 0;
    botStateObj.pc = 0;
    botStateObj.lastOrder = null;
    botStateObj.openOrders = [];
    botStateObj.cycleProfit = 0;
    botStateObj.orderCountInCycle = 0;
    botStateObj.lastOrderUSDTAmount = 0;
    botStateObj.nextCoverageUSDTAmount = 0;
    botStateObj.nextCoverageTargetPrice = 0;
}

/**
 * Función Principal de Lógica del Bot.
 * @param {Object} botStateObj - El objeto del estado del bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function runBotLogic(botStateObj, bitmartCreds) {
    console.log(`\n--- Ejecutando lógica del bot para ${botStateObj.userId}. Estado actual: ${botStateObj.state} ---`);

    try {
        // Siempre obtén el precio actual al inicio de cada ejecución del loop
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

        // Obtener balance actualizado al inicio de cada ciclo para NO_COVERAGE y otras validaciones
        const balanceInfo = await bitmartService.getBalance(bitmartCreds);
        const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
        const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available || 0) : 0;
        const btcBalance = balanceInfo.find(b => b.currency === 'BTC');
        const availableBTC = btcBalance ? parseFloat(btcBalance.available || 0) : 0;

        // Emit balance update
        if (ioInstance) {
            ioInstance.to(botStateObj.userId).emit('balanceUpdate', { usdt: availableUSDT, btc: availableBTC, userId: botStateObj.userId });
            ioInstance.to(botStateObj.userId).emit('botStateUpdate', { botState: botStateObj.toObject(), userId: botStateObj.userId });
        }

        let currentSignal = 'HOLD';

        switch (botStateObj.state) {
            case 'RUNNING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: RUNNING. Esperando señal de entrada de BUY desde el analizador de indicadores...`);

                if (parseFloat(botStateObj.ac || 0) > 0) {
                    console.warn(`[AUTOBOT][${botStateObj.userId}] Detectado AC > 0 en estado RUNNING. Transicionando a BUYING para reanudar ciclo.`);
                    botStateObj.state = 'BUYING';
                } else {
                    const analysisResult = await bitmartIndicatorAnalyzer.runAnalysis(botStateObj.currentPrice);
                    console.log(`[AUTOBOT][${botStateObj.userId}] Analizador de indicadores resultado: ${analysisResult.action} - Razón: ${analysisResult.reason}`);

                    if (analysisResult.action === 'BUY') {
                        currentSignal = 'BUY';
                        console.log(`[AUTOBOT][${botStateObj.userId}] ¡Señal de entrada de COMPRA DETECTADA por los indicadores!`);
                        const purchaseAmount = parseFloat(botStateObj.purchase || 0);

                        try {
                            // Llama a la nueva función centralizada en bitmartService
                          //  const orderDetails = await bitmartService.placeFirstBuyOrder(bitmartCreds, TRADE_SYMBOL, purchaseAmount, botStateObj.currentPrice);

                            botStateObj.ppc = orderDetails.price;
                            botStateObj.cp = orderDetails.price * orderDetails.size; // cp es el costo total en USDT
                            botStateObj.ac = orderDetails.size;
                            botStateObj.cycle = 1;
                            botStateObj.orderCountInCycle = 1;
                            botStateObj.lastOrderUSDTAmount = orderDetails.price * orderDetails.size;

                            botStateObj.lastOrder = {
                                orderId: orderDetails.orderId,
                                price: orderDetails.price,
                                size: orderDetails.size,
                                side: 'buy',
                                type: 'market',
                                state: 'filled'
                            };
                            botStateObj.openOrders = botStateObj.openOrders.filter(o => o.orderId !== orderDetails.orderId);

                            console.log(`[AUTOBOT][${botStateObj.userId}] Primera orden de compra COMPLETA. PPC: ${botStateObj.ppc.toFixed(2)}, CP: ${botStateObj.cp.toFixed(2)}, AC: ${botStateObj.ac.toFixed(5)} ${TRADE_SYMBOL.split('_')[0]}. Órdenes en ciclo: ${botStateObj.orderCountInCycle}`);
                            botStateObj.state = 'BUYING';
                        } catch (error) {
                            console.error(`[AUTOBOT][${botStateObj.userId}] Error al intentar colocar la primera orden de compra:`, error.message);
                            if (error.message.includes("Balance insuficiente") || error.message.includes("menor que el mínimo")) {
                                botStateObj.state = 'NO_COVERAGE'; // O pasa a NO_COVERAGE si hay problemas de balance
                                botStateObj.nextCoverageUSDTAmount = purchaseAmount;
                                botStateObj.nextCoverageTargetPrice = botStateObj.currentPrice;
                                console.warn(`[AUTOBOT][${botStateObj.userId}] Cambiando a NO_COVERAGE debido a: ${error.message}`);
                            } else {
                                botStateObj.state = 'RUNNING'; // Permanece en RUNNING para reintentar la entrada
                            }
                        }
                    } else if (analysisResult.action === 'SELL') {
                        currentSignal = 'HOLD';
                        console.log(`[AUTOBOT][${botStateObj.userId}] Indicador sugiere VENTA, pero no hay activo (AC = 0). Manteniendo HOLD.`);
                    } else {
                        currentSignal = 'HOLD';
                        console.log(`[AUTOBOT][${botStateObj.userId}] Esperando una señal de COMPRA de los indicadores.`);
                    }
                }
                break;

            case 'BUYING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: BUYING. Gestionando compras y coberturas...`);
                console.log(`[AUTOBOT][${botStateObj.userId}] PPC: ${parseFloat(botStateObj.ppc || 0).toFixed(2)}, CP: ${parseFloat(botStateObj.cp || 0).toFixed(2)}, AC: ${parseFloat(botStateObj.ac || 0).toFixed(8)} BTC`);
                console.log(`[AUTOBOT][${botStateObj.userId}] Último precio de orden: ${botStateObj.lastOrder?.price?.toFixed(2) ?? 'N/A'}`);

                currentSignal = 'BUY';

                const analysisResultForSell = await bitmartIndicatorAnalyzer.runAnalysis(botStateObj.currentPrice);
                if (analysisResultForSell.action === 'SELL' && parseFloat(botStateObj.ac || 0) > 0) {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Indicador sugiere VENTA mientras estamos en BUYING. Transicionando a SELLING.`);
                    botStateObj.state = 'SELLING';
                    currentSignal = 'SELL';
                } else if (parseFloat(botStateObj.ac || 0) > 0) {
                    let nextUSDTAmount;
                    const lastUSDTAmount = parseFloat(botStateObj.lastOrderUSDTAmount || botStateObj.purchase || 0);
                    const incrementFactor = parseFloat(botStateObj.increment || 100) / 100;

                    if (botStateObj.orderCountInCycle === 0) {
                        nextUSDTAmount = parseFloat(botStateObj.purchase || 0);
                    } else {
                        nextUSDTAmount = lastUSDTAmount * (1 + incrementFactor);
                    }
                    nextUSDTAmount = parseFloat(nextUSDTAmount.toFixed(2));

                    const lastOrderPrice = parseFloat(botStateObj.lastOrder?.price || botStateObj.ppc || botStateObj.currentPrice || 0);
                    const decrementFactor = parseFloat(botStateObj.decrement || 1) / 100;
                    const nextCoveragePrice = lastOrderPrice * (1 - decrementFactor);
                    const roundedNextCoveragePrice = parseFloat(nextCoveragePrice.toFixed(2));

                    console.log(`[DEBUG_COVERAGE] Próximo monto USDT: ${nextUSDTAmount.toFixed(2)}, Precio de última orden: ${lastOrderPrice.toFixed(2)}, Precio para próxima cobertura: ${roundedNextCoveragePrice.toFixed(2)} USDT.`);

                    if (availableUSDT < nextUSDTAmount || nextUSDTAmount < MIN_USDT_VALUE_FOR_BITMART) {
                        if (botStateObj.state !== 'NO_COVERAGE') {
                            console.warn(`[AUTOBOT][${botStateObj.userId}] Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto (${nextUSDTAmount.toFixed(2)} USDT) es menor al mínimo para la próxima orden de cobertura. Cambiando a NO_COVERAGE.`);
                            botStateObj.state = 'NO_COVERAGE';
                            botStateObj.nextCoverageUSDTAmount = nextUSDTAmount;
                            botStateObj.nextCoverageTargetPrice = roundedNextCoveragePrice;
                            currentSignal = 'HOLD';
                        }
                    } else if (botStateObj.currentPrice <= roundedNextCoveragePrice) {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Precio de cobertura alcanzado! Intentando colocar orden de cobertura.`);
                        botStateObj.nextCoverageUSDTAmount = nextUSDTAmount;
                        botStateObj.nextCoverageTargetPrice = roundedNextCoveragePrice;
                        try {
                            // Llama a la nueva función centralizada en bitmartService
                            const orderDetails = await bitmartService.placeCoverageBuyOrder(bitmartCreds, TRADE_SYMBOL, nextUSDTAmount, roundedNextCoveragePrice);

                            // Actualizar PPC, CP, AC
                            botStateObj.ac = parseFloat((botStateObj.ac + orderDetails.size).toFixed(8));
                            botStateObj.cp = parseFloat((botStateObj.cp + (orderDetails.price * orderDetails.size)).toFixed(2));
                            botStateObj.ppc = botStateObj.ac > 0 ? parseFloat((botStateObj.cp / botStateObj.ac).toFixed(2)) : 0;
                            botStateObj.orderCountInCycle++;
                            botStateObj.lastOrderUSDTAmount = orderDetails.price * orderDetails.size;

                            botStateObj.lastOrder = {
                                orderId: orderDetails.orderId,
                                price: orderDetails.price,
                                size: orderDetails.size,
                                side: 'buy',
                                type: 'limit',
                                state: 'filled'
                            };
                            botStateObj.openOrders = botStateObj.openOrders.filter(o => o.orderId !== orderDetails.orderId);

                            console.log(`[AUTOBOT][${botStateObj.userId}] Orden de cobertura COMPLETA. Nuevo AC: ${botStateObj.ac.toFixed(8)}, Nuevo CP: ${botStateObj.cp.toFixed(2)}, Nuevo PPC: ${botStateObj.ppc.toFixed(2)}. Ordenes en ciclo: ${botStateObj.orderCountInCycle}`);
                        } catch (error) {
                            console.error(`[AUTOBOT][${botStateObj.userId}] Error al intentar colocar orden de cobertura:`, error.message);
                            // Si la orden no se completó, permanecer en BUYING para reintentar o reevaluar
                            if (error.message.includes("Balance insuficiente") || error.message.includes("menor al mínimo")) {
                                botStateObj.state = 'NO_COVERAGE';
                                botStateObj.nextCoverageUSDTAmount = nextUSDTAmount;
                                botStateObj.nextCoverageTargetPrice = roundedNextCoveragePrice;
                                console.warn(`[AUTOBOT][${botStateObj.userId}] Cambiando a NO_COVERAGE debido a: ${error.message}`);
                            } else {
                                botStateObj.state = 'BUYING'; // Permanece en BUYING para reintentar
                            }
                        }
                    } else {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Esperando precio para próxima cobertura o venta.`);
                        currentSignal = 'HOLD';
                    }
                } else if (parseFloat(botStateObj.ac || 0) === 0 && botStateObj.lastOrder && botStateObj.lastOrder.side === 'buy' && botStateObj.lastOrder.state !== 'filled') {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Esperando confirmación de la primera orden o actualización de AC (puede que la primera orden esté pendiente).`);
                    currentSignal = 'HOLD';
                }
                break;

            case 'SELLING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: SELLING. Gestionando ventas...`);
                currentSignal = 'SELL';

                botStateObj.pm = Math.max(parseFloat(botStateObj.pm || 0), parseFloat(botStateObj.currentPrice || 0));
                botStateObj.pv = parseFloat((botStateObj.pm * (1 - 0.005)).toFixed(2));
                botStateObj.pc = parseFloat((botStateObj.pm * (1 - 0.004)).toFixed(2));

                if ((botStateObj.currentPrice <= botStateObj.pc) && parseFloat(botStateObj.ac || 0) > 0) {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Condiciones de venta alcanzadas! Colocando orden de venta.`);
                    try {
                        // Llama a la nueva función centralizada en bitmartService
                        const orderDetails = await bitmartService.placeSellOrder(bitmartCreds, TRADE_SYMBOL, parseFloat(botStateObj.ac));

                        const revenueFromSale = orderDetails.price * orderDetails.size;
                        const commissionRate = 0.001; // Ejemplo, ajustar según BitMart
                        const buyCommission = parseFloat((botStateObj.cp || 0) * commissionRate);
                        const sellCommission = revenueFromSale * commissionRate;

                        botStateObj.cycleProfit = revenueFromSale - (botStateObj.cp || 0) - buyCommission - sellCommission;
                        botStateObj.profit = parseFloat(((botStateObj.profit || 0) + botStateObj.cycleProfit).toFixed(2));

                        console.log(`[AUTOBOT][${botStateObj.userId}] Ciclo ${botStateObj.cycle} completado. Ganancia/Pérdida del ciclo: ${botStateObj.cycleProfit.toFixed(2)} USDT. Ganancia total: ${botStateObj.profit.toFixed(2)} USDT.`);

                        if (botStateObj.stopAtCycleEnd) {
                            console.log(`[AUTOBOT][${botStateObj.userId}] Bandera "Stop on Cycle End" activada. Deteniendo el bot al final del ciclo.`);
                            await stopBotStrategy(botStateObj, bitmartCreds);
                            return;
                        }

                        resetCycleVariables(botStateObj);
                        botStateObj.cycle++;
                        botStateObj.state = 'RUNNING';
                        console.log(`[AUTOBOT][${botStateObj.userId}] Bot listo para el nuevo ciclo en estado RUNNING, esperando próxima señal de COMPRA.`);

                    } catch (error) {
                        console.error(`[AUTOBOT][${botStateObj.userId}] Error al intentar colocar la orden de venta:`, error.message);
                        // Si la orden no se completó o falló, permanecer en SELLING para reintentar o reevaluar
                        botStateObj.state = 'SELLING';
                    }
                } else {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Esperando condiciones para la venta. Precio actual: ${botStateObj.currentPrice.toFixed(2)}, PM: ${botStateObj.pm.toFixed(2)}, PV: ${botStateObj.pv.toFixed(2)}, PC: ${botStateObj.pc.toFixed(2)}`);
                }
                break;

            case 'NO_COVERAGE':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: NO_COVERAGE. Esperando fondos para la próxima orden de ${parseFloat(botStateObj.nextCoverageUSDTAmount || 0).toFixed(2)} USDT @ ${parseFloat(botStateObj.nextCoverageTargetPrice || 0).toFixed(2)}.`);
                currentSignal = 'HOLD';

                if (parseFloat(botStateObj.ac || 0) > 0) {
                    const ppcValue = parseFloat(botStateObj.ppc || 0);
                    const triggerPercentage = parseFloat(botStateObj.trigger || 0);

                    if (ppcValue > 0 && triggerPercentage > 0) {
                        const targetSellPrice = ppcValue * (1 + (triggerPercentage / 100));

                        if (botStateObj.currentPrice >= targetSellPrice) {
                            console.log(`[AUTOBOT][${botStateObj.userId}] Precio actual (${botStateObj.currentPrice.toFixed(2)} USDT) alcanzó o superó el objetivo de venta por TRIGGER (${targetSellPrice.toFixed(2)} USDT) desde NO_COVERAGE.`);
                            botStateObj.state = 'SELLING';
                        }
                    } else {
                        console.warn(`[AUTOBOT][${botStateObj.userId}] PPC (${ppcValue}) o TRIGGER (${triggerPercentage}) inválidos en NO_COVERAGE. No se puede evaluar la condición de venta por TRIGGER.`);
                    }
                }

                if (botStateObj.state === 'NO_COVERAGE') {
                    const nextBuyAmount = parseFloat(botStateObj.nextCoverageUSDTAmount || 0);
                    if (availableUSDT >= nextBuyAmount && nextBuyAmount >= MIN_USDT_VALUE_FOR_BITMART) {
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
        } else if (error.message.includes("Cannot read properties of undefined (reading 'toFixed')") || error.message.includes("is not a function")) {
            console.error(`[AUTOBOT][${botStateObj.userId}] Error crítico de tipo de dato (toFixed o similar). Volviendo a un estado operativo si es posible.`);
            if (botStateObj) {
                if (botStateObj.ac > 0) {
                    botStateObj.state = 'BUYING';
                } else {
                    botStateObj.state = 'RUNNING';
                }
                await saveBotState(botStateObj);
                if (ioInstance) {
                    ioInstance.to(botStateObj.userId).emit('botError', { message: `Error interno de cálculo. Bot intentando recuperarse en estado ${botStateObj.state}.`, userId: botStateObj.userId });
                    ioInstance.to(botStateObj.userId).emit('signalUpdate', { signal: 'ERROR_REINTENTO', userId: botStateObj.userId });
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

// Lógica para iniciar la estrategia del bot
const userBotIntervals = new Map();

/**
 * Inicia la estrategia del bot para un usuario.
 * @param {string} userId - El ID del usuario.
 * @param {Object} botParams - Parámetros iniciales para el bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function startBotStrategy(userId, botParams, bitmartCreds) {
    console.log(`[AUTOBOT] Iniciando estrategia para el usuario: ${userId}`);
    let botState = await loadBotStateForUser(userId);

    botState.purchase = parseFloat(botParams.purchase || 0);
    botState.increment = parseFloat(botParams.increment || 0);
    botState.decrement = parseFloat(botParams.decrement || 0);
    botState.trigger = parseFloat(botParams.trigger || 0);
    botState.stopAtCycleEnd = botParams.stopAtCycleEnd;

    if (parseFloat(botState.ac || 0) > 0) {
        botState.state = 'BUYING';
        console.log(`[AUTOBOT][${userId}] Bot reanudado con AC existente. Estado ajustado a BUYING.`);
    } else {
        botState.state = 'RUNNING';
        console.log(`[AUTOBOT][${userId}] Bot iniciando nuevo ciclo. Estado ajustado a RUNNING.`);
    }
    botState.isRunning = true;

    if (parseFloat(botState.ac || 0) === 0) {
        resetCycleVariables(botState);
        botState.cycle = 1;
    } else {
        console.log(`[AUTOBOT][${userId}] Reanudando bot con AC existente: ${parseFloat(botState.ac || 0).toFixed(8)} BTC. Estado: ${botState.state}`);
    }

    await saveBotState(botState);

    if (userBotIntervals.has(userId)) {
        clearInterval(userBotIntervals.get(userId));
        userBotIntervals.delete(userId);
    }

    await runBotLogic(botState, bitmartCreds);
    const intervalId = setInterval(async () => {
        let latestBotState = await loadBotStateForUser(userId);
        if (latestBotState.isRunning && latestBotState.state !== 'STOPPED') {
            await runBotLogic(latestBotState, bitmartCreds);
        } else {
            console.log(`[AUTOBOT][${userId}] El bot no está en estado activo. Deteniendo intervalo.`);
            clearInterval(userBotIntervals.get(userId));
            userBotIntervals.delete(userId);
            if (latestBotState.state !== 'STOPPED') {
                latestBotState.state = 'STOPPED';
                latestBotState.isRunning = false;
                await saveBotState(latestBotState);
            }
        }
    }, 10000);

    userBotIntervals.set(userId, intervalId);
    console.log(`[AUTOBOT] Estrategia iniciada para ${userId} con intervalo ID: ${intervalId}`);
    return botState;
}

/**
 * Detiene la estrategia del bot para un usuario.
 * @param {Object} botStateObj - El objeto del estado del bot a detener.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function stopBotStrategy(botStateObj, bitmartCreds) {
    console.log(`[AUTOBOT] Deteniendo estrategia para el usuario: ${botStateObj.userId}`);

    if (userBotIntervals.has(botStateObj.userId)) {
        clearInterval(userBotIntervals.get(botStateObj.userId));
        userBotIntervals.delete(botStateObj.userId);
        console.log(`[AUTOBOT] Intervalo de estrategia limpiado para ${botStateObj.userId}.`);
    } else {
        console.warn(`[AUTOBOT] No se encontró intervalo de estrategia activo para ${botStateObj.userId}.`);
    }

    // Llama a la nueva función centralizada en bitmartService
    await bitmartService.cancelAllOpenOrders(bitmartCreds, TRADE_SYMBOL);

    botStateObj.state = 'STOPPED';
    botStateObj.isRunning = false;
    await saveBotState(botStateObj);
    console.log(`[AUTOBOT] Estrategia detenida y estado actualizado en DB para ${botStateObj.userId}.`);
    if (ioInstance) {
        ioInstance.to(botStateObj.userId).emit('signalUpdate', { signal: 'DETENIDO', userId: botStateObj.userId });
        ioInstance.to(botStateObj.userId).emit('botStateUpdate', { botState: botStateObj.toObject(), userId: botStateObj.userId });
    }
    return botStateObj;
}

/**
 * Función para manejar el inicio/parada del bot.
 * @param {string} userId - ID del usuario.
 * @param {string} action - 'start' o 'stop'.
 * @param {Object} botParams - Parámetros del bot (purchase, increment, decrement, trigger, stopAtCycleEnd).
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function toggleBotState(userId, action, botParams, bitmartCreds) {
    let botState = await loadBotStateForUser(userId);
    console.log(`[AUTOBOT] Solicitud para ${action} el bot para usuario ${userId}. Estado actual: ${botState.state}`);

    if (action === 'start') {
        if (botState.isRunning) {
            console.warn(`[AUTOBOT] El bot ya está corriendo para ${userId}.`);
            return botState;
        }
        return await startBotStrategy(userId, botParams, bitmartCreds);
    } else if (action === 'stop') {
        if (!botState.isRunning) {
            console.warn(`[AUTOBOT] El bot ya está detenido para ${userId}.`);
            return botState;
        }
        return await stopBotStrategy(botState, bitmartCreds);
    } else {
        console.error(`[AUTOBOT] Acción desconocida: ${action}`);
        throw new Error('Acción de bot desconocida.');
    }
}

module.exports = {
    init,
    loadBotStateForUser,
    saveBotState,
    toggleBotState,
};