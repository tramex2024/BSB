// server/autobotLogic.js
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
// RENOMBRADA DE setIoInstance A init para coincidir con server.js
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
            if (botState.state === 'RUNNING' || botState.state === 'BUYING' || botState.state === 'SELLING' || botState.state === 'NO_COVERAGE' || botState.state === 'ERROR') { // Agregado ERROR aquí
                botState.state = 'STOPPED';
                await botState.save(); // Guarda el cambio de estado en la DB
                console.warn(`[DB] Bot de ${userId} estaba en estado activo. Se ha reiniciado en STOPPED y actualizado en DB. Por favor, inícielo manualmente.`);
            }
        }

        // Si el bot se carga con activo comprado (AC > 0), pero está en estado 'STOPPED' o 'RUNNING',
        // significa que un ciclo quedó a medias y el servidor se reinició.
        // Lo movemos a BUYING para que la lógica de gestión de ciclo continúe en el próximo `runBotLogic` si se inicia.
        if (botState.ac > 0 && (botState.state === 'RUNNING' || botState.state === 'STOPPED')) {
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

// --- Funciones de Cancelación de Órdenes ---
/**
 * Intenta cancelar todas las órdenes abiertas para un símbolo y usuario dados.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario (apiKey, secretKey, apiMemo).
 * @param {string} symbol - Símbolo de trading (ej. 'BTC_USDT').
 */
async function cancelOpenOrders(bitmartCreds, symbol) {
    console.log(`[AUTOBOT] Intentando cancelar órdenes abiertas para ${symbol}...`);
    try {
        // Usar las credenciales proporcionadas para las llamadas al servicio
        const openOrders = await bitmartService.getOpenOrders(bitmartCreds, symbol);
        if (openOrders && openOrders.orders && openOrders.orders.length > 0) {
            for (const order of openOrders.orders) {
                console.log(`[AUTOBOT] Cancelando orden: ${order.order_id}`);
                await bitmartService.cancelOrder(bitmartCreds, symbol, order.order_id);
                console.log(`[AUTOBOT] Orden ${order.order_id} cancelada.`);
            }
            console.log(`[AUTOBOT] Todas las ${openOrders.orders.length} órdenes abiertas para ${symbol} han sido canceladas.`);
        } else {
            console.log('[AUTOBOT] No se encontraron órdenes abiertas para cancelar.');
        }
    } catch (error) {
        console.error('[AUTOBOT] Error al cancelar órdenes abiertas:', error.message);
    }
}

// --- Funciones de Colocación de Órdenes ---

/**
 * Coloca la primera orden de compra (Market) para iniciar un ciclo.
 * @param {Object} botStateObj - El objeto del estado del bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function placeFirstBuyOrder(botStateObj, bitmartCreds) {
    console.log(`[AUTOBOT][${botStateObj.userId}] Intentando colocar la primera orden de compra (CICLO ${botStateObj.cycle})...`);
    const tradeSymbol = TRADE_SYMBOL;
    const orderType = 'market';
    const side = 'buy';

    const sizeUSDT = parseFloat(botStateObj.purchase || 0); // Ensure purchase is a number
    console.log(`[DEBUG_ORDER] Tamaño de compra en USDT (purchaseAmount): ${sizeUSDT.toFixed(2)} USDT.`);

    // Obtener balance y precio actual para asegurar la compra
    const balanceInfo = await bitmartService.getBalance(bitmartCreds); // Pasar credenciales
    const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available || 0) : 0; // Handle undefined 'available'
    console.log(`[DEBUG_ORDER] Balance USDT disponible: ${availableUSDT.toFixed(2)} USDT.`);

    // Ensure currentPrice is valid before calculation
    if (botStateObj.currentPrice === undefined || botStateObj.currentPrice === null || botStateObj.currentPrice === 0) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Precio actual no disponible o es cero para la primera orden. Reintentando...`);
        botStateObj.state = 'RUNNING'; // Sigue en RUNNING para reintentar la compra en el siguiente ciclo
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }

    if (availableUSDT < sizeUSDT) {
        console.warn(`[AUTOBOT][${botStateObj.userId}] Balance insuficiente para la primera orden. Necesario: ${sizeUSDT.toFixed(2)} USDT, Disponible: ${availableUSDT.toFixed(2)} USDT.`);
        botStateObj.state = 'NO_COVERAGE';
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }

    let sizeBTC = sizeUSDT / botStateObj.currentPrice;
    // Ensure sizeBTC is a valid number before toFixed
    if (isNaN(sizeBTC) || !isFinite(sizeBTC)) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Error calculando sizeBTC. sizeUSDT: ${sizeUSDT}, currentPrice: ${botStateObj.currentPrice}`);
        botStateObj.state = 'RUNNING'; // Reintentar
        await saveBotState(botStateObj);
        return;
    }
    sizeBTC = parseFloat(sizeBTC.toFixed(8)); // Redondear a 8 decimales para BTC
    console.log(`[DEBUG_ORDER] Tamaño calculado en BTC: ${sizeBTC} ${TRADE_SYMBOL.split('_')[0]}.`);

    if (sizeUSDT < MIN_USDT_VALUE_FOR_BITMART) {
        console.error(`[AUTOBOT][${botStateObj.userId}] El valor de la orden (${sizeUSDT.toFixed(2)} USDT) es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART} USDT). Ajusta tu PURCHASE.`);
        botStateObj.state = 'STOPPED';
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }
    try {
        console.log(`[AUTOBOT][${botStateObj.userId}] Colocando orden de COMPRA (MARKET): ${sizeBTC.toFixed(8)} ${TRADE_SYMBOL.split('_')[0]} por ${sizeUSDT.toFixed(2)} USDT a precio de ${botStateObj.currentPrice.toFixed(2)} USDT.`);

        const orderResult = await bitmartService.placeOrder(bitmartCreds, tradeSymbol, side, orderType, sizeUSDT.toString());

        console.log('[DEBUG_ORDER] Resultado de la primera orden de compra:', orderResult);

        if (orderResult && orderResult.order_id) {
            // Espera simulada para que la orden se procese en el exchange.
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Obtén los detalles reales de la orden ejecutada desde BitMart.
            const filledOrder = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, orderResult.order_id); // Pasar credenciales

            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price || 0); // Safely parse price
                const actualSize = parseFloat(filledOrder.filled_size || 0); // Safely parse filled_size
                const actualAmountUSD = actualPrice * actualSize;

                botStateObj.ppc = actualPrice;
                botStateObj.cp = actualAmountUSD;
                botStateObj.ac = actualSize;
                botStateObj.cycle = 1;
                botStateObj.orderCountInCycle = 1;
                botStateObj.lastOrderUSDTAmount = actualAmountUSD;

                botStateObj.lastOrder = {
                    orderId: orderResult.order_id,
                    price: actualPrice, // Usar precio real de ejecución
                    size: actualSize, // Usar tamaño real llenado
                    side: 'buy',
                    type: 'market',
                    state: 'filled'
                };
                // Filter out the fulfilled order from openOrders if it was somehow added.
                // It's a market order, so it shouldn't typically be in openOrders unless there was a delay.
                botStateObj.openOrders = botStateObj.openOrders.filter(o => o.orderId !== orderResult.order_id);

                console.log(`[AUTOBOT][${botStateObj.userId}] Primera orden de compra COMPLETA. PPC: ${botStateObj.ppc.toFixed(2)}, CP: ${botStateObj.cp.toFixed(2)}, AC: ${botStateObj.ac.toFixed(5)} ${TRADE_SYMBOL.split('_')[0]}. Órdenes en ciclo: ${botStateObj.orderCountInCycle}`);
                botStateObj.state = 'BUYING'; // Cambia el estado a 'BUYING' para que el bot empiece a gestionar futuras compras/ventas
            } else {
                console.warn(`[AUTOBOT][${botStateObj.userId}] La primera orden ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
                botStateObj.state = 'RUNNING'; // Reintentar buscar punto de entrada
            }

        } else {
            console.error(`[AUTOBOT][${botStateObj.userId}] Error al colocar la primera orden: No se recibió order_id o la respuesta es inválida.`);
            botStateObj.state = 'RUNNING'; // Reintentar buscar punto de entrada
        }
    } catch (error) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Excepción al colocar la primera orden:`, error.message);
        botStateObj.state = 'RUNNING'; // Reintentar buscar punto de entrada
    } finally {
        await saveBotState(botStateObj); // Ensure state is saved even if errors occur
    }
}

/**
 * Coloca una orden de compra de cobertura (Limit).
 * @param {Object} botStateObj - El objeto del estado del bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function placeCoverageBuyOrder(botStateObj, bitmartCreds) {
    console.log(`[AUTOBOT][${botStateObj.userId}] Intentando colocar orden de compra de COBERTURA (CICLO ${botStateObj.cycle})...`);
    const tradeSymbol = TRADE_SYMBOL;
    const side = 'buy';
    const orderType = 'limit';
    const sizeUSDT = parseFloat(botStateObj.nextCoverageUSDTAmount || 0); // Ensure it's a number
    const targetPrice = parseFloat(botStateObj.nextCoverageTargetPrice || 0); // Ensure it's a number

    const balanceInfo = await bitmartService.getBalance(bitmartCreds); // Pasar credenciales
    const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available || 0) : 0; // Handle undefined 'available'

    if (availableUSDT < sizeUSDT || sizeUSDT < MIN_USDT_VALUE_FOR_BITMART) {
        console.warn(`[AUTOBOT][${botStateObj.userId}] Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto de orden (${sizeUSDT.toFixed(2)} USDT) es menor al mínimo para orden de cobertura. Cambiando a NO_COVERAGE.`);
        botStateObj.state = 'NO_COVERAGE';
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }

    // Ensure targetPrice is valid before calculation
    if (targetPrice === undefined || targetPrice === null || targetPrice === 0) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Precio objetivo de cobertura no disponible o es cero. Volviendo a BUYING.`); // Modificado
        botStateObj.state = 'BUYING'; // Modificado: Vuelve a BUYING para reevaluar
        await saveBotState(botStateObj);
        return;
    }

    let sizeBTC = sizeUSDT / targetPrice;
    // Ensure sizeBTC is a valid number before toFixed
    if (isNaN(sizeBTC) || !isFinite(sizeBTC)) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Error calculando sizeBTC para cobertura. sizeUSDT: ${sizeUSDT}, targetPrice: ${targetPrice}. Volviendo a BUYING.`); // Modificado
        botStateObj.state = 'BUYING'; // Modificado: Vuelve a BUYING para reevaluar
        await saveBotState(botStateObj);
        return;
    }
    sizeBTC = parseFloat(sizeBTC.toFixed(8));

    try {
        console.log(`[AUTOBOT][${botStateObj.userId}] Colocando orden de COMPRA (LIMIT) de cobertura: ${sizeBTC.toFixed(8)} ${TRADE_SYMBOL.split('_')[0]} a ${targetPrice.toFixed(2)} USDT.`);
        const orderResult = await bitmartService.placeOrder(bitmartCreds, tradeSymbol, side, orderType, sizeUSDT.toString(), targetPrice.toFixed(2));

        console.log(`[AUTOBOT][${botStateObj.userId}] Resultado de la orden de cobertura:`, orderResult);

        if (orderResult && orderResult.order_id) {
            const newOrder = {
                orderId: orderResult.order_id,
                price: targetPrice,
                size: sizeBTC,
                side: side,
                type: 'limit',
                state: 'new'
            };
            botStateObj.openOrders.push(newOrder);
            console.log(`[AUTOBOT][${botStateObj.userId}] Orden de cobertura colocada: ID ${orderResult.order_id}. Monitoreando...`);

            // Espera simulada para que la orden se procese en el exchange.
            await new Promise(resolve => setTimeout(resolve, 2000));

            const filledOrder = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, orderResult.order_id); // Pasar credenciales

            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price || 0); // Safely parse price
                const actualSize = parseFloat(filledOrder.filled_size || 0); // Corrected: use filled_size, safely parse
                const actualAmountUSD = actualPrice * actualSize;

                // Actualizar PPC, CP, AC
                botStateObj.ac = parseFloat((botStateObj.ac + actualSize).toFixed(8)); // Ensure these are numbers before addition
                botStateObj.cp = parseFloat((botStateObj.cp + actualAmountUSD).toFixed(2));
                // Ensure AC is not zero before division for PPC
                botStateObj.ppc = botStateObj.ac > 0 ? parseFloat((botStateObj.cp / botStateObj.ac).toFixed(2)) : 0;
                botStateObj.orderCountInCycle++;
                botStateObj.lastOrderUSDTAmount = actualAmountUSD;

                botStateObj.lastOrder = {
                    orderId: orderResult.order_id,
                    price: actualPrice,
                    size: actualSize,
                    side: side,
                    type: 'limit',
                    state: 'filled'
                };
                // Filter out the fulfilled order from openOrders
                botStateObj.openOrders = botStateObj.openOrders.filter(o => o.orderId !== orderResult.order_id);

                console.log(`[AUTOBOT][${botStateObj.userId}] Orden de cobertura COMPLETA. Nuevo AC: ${botStateObj.ac.toFixed(8)}, Nuevo CP: ${botStateObj.cp.toFixed(2)}, Nuevo PPC: ${botStateObj.ppc.toFixed(2)}. Ordenes en ciclo: ${botStateObj.orderCountInCycle}`);
                // botStateObj.state permanece en 'BUYING'
            } else {
                console.warn(`[AUTOBOT][${botStateObj.userId}] La orden de cobertura ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}. Permaneciendo en BUYING.`); // Modificado
                // Podrías dejar la orden en openOrders y esperar su llenado en el próximo ciclo
            }

        } else {
            console.error(`[AUTOBOT][${botStateObj.userId}] Error al colocar orden de cobertura: No se recibió order_id o la respuesta es inválida. Permaneciendo en BUYING.`); // Modificado
        }
    } catch (error) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Excepción al colocar orden de cobertura:`, error.message);
        botStateObj.state = 'BUYING'; // Modificado: Vuelve a BUYING para reevaluar
    } finally {
        await saveBotState(botStateObj); // Ensure state is saved even if errors occurs
    }
}

/**
 * Coloca una orden de venta (Market) para cerrar un ciclo.
 * @param {Object} botStateObj - El objeto del estado del bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function placeSellOrder(botStateObj, bitmartCreds) {
    console.log(`[AUTOBOT][${botStateObj.userId}] Intentando colocar orden de VENTA (CICLO ${botStateObj.cycle})...`);
    const tradeSymbol = TRADE_SYMBOL;
    const side = 'sell';
    const orderType = 'market';
    let sizeBTC = parseFloat(botStateObj.ac || 0); // Ensure ac is a number

    if (sizeBTC <= 0) {
        console.warn(`[AUTOBOT][${botStateObj.userId}] No hay activo para vender (AC = 0). Volviendo a RUNNING.`); // Modificado
        botStateObj.state = 'RUNNING'; // Volver a RUNNING para buscar nueva entrada
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }

    try {
        console.log(`[AUTOBOT][${botStateObj.userId}] Colocando orden de VENTA (MARKET): ${sizeBTC.toFixed(8)} ${TRADE_SYMBOL.split('_')[0]} a precio de ${botStateObj.currentPrice?.toFixed(2) ?? 'N/A'} USDT.`); // Use optional chaining for currentPrice

        const orderResult = await bitmartService.placeOrder(bitmartCreds, tradeSymbol, side, orderType, sizeBTC.toString()); // Pasar credenciales

        console.log('[DEBUG_ORDER] Resultado de la orden de venta:', orderResult);

        if (orderResult && orderResult.order_id) {
            console.log(`[AUTOBOT][${botStateObj.userId}] Orden de VENTA colocada con éxito. ID de orden: ${orderResult.order_id}`);

            await cancelOpenOrders(bitmartCreds, TRADE_SYMBOL); // Cancelar órdenes de compra pendientes, pasando credenciales

            // Obtén los detalles reales de la orden ejecutada desde BitMart.
            const filledOrder = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, orderResult.order_id); // Pasar credenciales

            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price || 0); // Safely parse price
                const actualSize = parseFloat(filledOrder.filled_size || 0); // Safely parse filled_size (preferred over adesc if filled_size is available)
                const revenueFromSale = actualPrice * actualSize;
                const commissionRate = 0.001; // 0.1% (Tasa de comisión de ejemplo, ajusta según BitMart)
                const buyCommission = parseFloat((botStateObj.cp || 0) * commissionRate); // Ensure cp is a number
                const sellCommission = revenueFromSale * commissionRate;

                botStateObj.cycleProfit = revenueFromSale - (botStateObj.cp || 0) - buyCommission - sellCommission;
                botStateObj.profit = parseFloat(((botStateObj.profit || 0) + botStateObj.cycleProfit).toFixed(2)); // Ensure profit is a number

                console.log(`[AUTOBOT][${botStateObj.userId}] Ciclo ${botStateObj.cycle} completado. Ganancia/Pérdida del ciclo: ${botStateObj.cycleProfit.toFixed(2)} USDT. Ganancia total: ${botStateObj.profit.toFixed(2)} USDT.`);

                // LÓGICA DE DETENCIÓN POR 'STOP ON CYCLE END'
                if (botStateObj.stopAtCycleEnd) { // Usar stopAtCycleEnd del botStateObj
                    console.log(`[AUTOBOT][${botStateObj.userId}] Bandera "Stop on Cycle End" activada. Deteniendo el bot al final del ciclo.`);
                    // Asumiendo que stopBotStrategy ahora es asíncrono y guarda el estado
                    await stopBotStrategy(botStateObj, bitmartCreds); // Llama a la función de detención completa, pasando botStateObj y credenciales
                    return; // Salir después de detener el bot
                }

                resetCycleVariables(botStateObj); // Resetear variables para el nuevo ciclo
                botStateObj.cycle++; // Incrementar el ciclo para el nuevo inicio
                botStateObj.state = 'RUNNING'; // Volver a RUNNING para que espere la nueva señal de COMPRA
                console.log(`[AUTOBOT][${botStateObj.userId}] Bot listo para el nuevo ciclo en estado RUNNING, esperando próxima señal de COMPRA.`);

            } else {
                console.warn(`[AUTOBOT][${botStateObj.userId}] La orden de venta ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}. Permaneciendo en SELLING.`); // Modificado
            }

        } else {
            console.error(`[AUTOBOT][${botStateObj.userId}] Error al colocar la orden de venta: No se recibió order_id o la respuesta es inválida. Permaneciendo en SELLING.`); // Modificado
        }
    } catch (error) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Excepción al colocar la orden de venta:`, error.message);
        botStateObj.state = 'SELLING'; // Modificado: Vuelve a SELLING para reevaluar
    } finally {
        await saveBotState(botStateObj); // Ensure state is saved even if errors occur
    }
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
        if (ticker && typeof ticker.last !== 'undefined' && ticker.last !== null) { // Check for undefined/null
            botStateObj.currentPrice = parseFloat(ticker.last);
            console.log(`[AUTOBOT][${botStateObj.userId}] Precio actual de BitMart actualizado: ${botStateObj.currentPrice.toFixed(2)} USDT`);
        } else {
            console.warn(`[AUTOBOT][${botStateObj.userId}] No se pudo obtener el precio actual. Reintentando en el próximo ciclo.`); // Mensaje ajustado
            // Emitir un evento al frontend para notificar sobre el problema de precio
            if (ioInstance) {
                ioInstance.to(botStateObj.userId).emit('botError', { message: `Bot para ${botStateObj.userId}: No se pudo obtener el precio actual de ${TRADE_SYMBOL}. Reintentando.`, userId: botStateObj.userId });
            }
            return; // Salir si no hay precio, para evitar errores en cálculos
        }

        // Obtener balance actualizado al inicio de cada ciclo para NO_COVERAGE y otras validaciones
        const balanceInfo = await bitmartService.getBalance(bitmartCreds); // Pasar credenciales
        const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
        const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available || 0) : 0; // Safely get available USDT
        const btcBalance = balanceInfo.find(b => b.currency === 'BTC');
        const availableBTC = btcBalance ? parseFloat(btcBalance.available || 0) : 0; // Safely get available BTC

        // Emit balance update
        if (ioInstance) {
            ioInstance.to(botStateObj.userId).emit('balanceUpdate', { usdt: availableUSDT, btc: availableBTC, userId: botStateObj.userId });
            // Also emit bot state updates to the specific user room
            ioInstance.to(botStateObj.userId).emit('botStateUpdate', { botState: botStateObj.toObject(), userId: botStateObj.userId });
        }

        let currentSignal = 'HOLD'; // Default signal state

        switch (botStateObj.state) {
            case 'RUNNING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: RUNNING. Esperando señal de entrada de BUY desde el analizador de indicadores...`);

                if (parseFloat(botStateObj.ac || 0) > 0) { // Ensure ac is a number
                    console.warn(`[AUTOBOT][${botStateObj.userId}] Detectado AC > 0 en estado RUNNING. Transicionando a BUYING para reanudar ciclo.`);
                    botStateObj.state = 'BUYING';
                } else {
                    const analysisResult = await bitmartIndicatorAnalyzer.runAnalysis(botStateObj.currentPrice); // Pasar precio actual
                    console.log(`[AUTOBOT][${botStateObj.userId}] Analizador de indicadores resultado: ${analysisResult.action} - Razón: ${analysisResult.reason}`);

                    if (analysisResult.action === 'BUY') {
                        currentSignal = 'BUY'; // Set signal to BUY
                        console.log(`[AUTOBOT][${botStateObj.userId}] ¡Señal de entrada de COMPRA DETECTADA por los indicadores!`);
                        const purchaseAmount = parseFloat(botStateObj.purchase || 0); // Ensure purchase is a number
                        if (availableUSDT >= purchaseAmount && purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART) {
                            botStateObj.state = 'BUYING';
                            await placeFirstBuyOrder(botStateObj, bitmartCreds); // Pasar botStateObj y credenciales
                        } else {
                            console.warn(`[AUTOBOT][${botStateObj.userId}] No hay suficiente USDT para la primera orden. Necesario: ${purchaseAmount.toFixed(2)} USDT (mínimo ${MIN_USDT_VALUE_FOR_BITMART}), Disponible: ${availableUSDT.toFixed(2)} USDT. Cambiando a NO_COVERAGE.`);
                            botStateObj.state = 'NO_COVERAGE';
                            botStateObj.nextCoverageUSDTAmount = purchaseAmount;
                            botStateObj.nextCoverageTargetPrice = botStateObj.currentPrice;
                        }
                    } else if (analysisResult.action === 'SELL') {
                        currentSignal = 'HOLD'; // OJO: Si el bot está en RUNNING (sin posición) y el análisis sugiere SELL, es un HOLD.
                        console.log(`[AUTOBOT][${botStateObj.userId}] Indicador sugiere VENTA, pero no hay activo (AC = 0). Manteniendo HOLD.`);
                    } else { // Default to HOLD if no clear BUY/SELL signal
                        currentSignal = 'HOLD';
                        console.log(`[AUTOBOT][${botStateObj.userId}] Esperando una señal de COMPRA de los indicadores.`);
                    }
                }
                break;

            case 'BUYING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: BUYING. Gestionando compras y coberturas...`);
                console.log(`[AUTOBOT][${botStateObj.userId}] PPC: ${parseFloat(botStateObj.ppc || 0).toFixed(2)}, CP: ${parseFloat(botStateObj.cp || 0).toFixed(2)}, AC: ${parseFloat(botStateObj.ac || 0).toFixed(8)} BTC`);
                console.log(`[AUTOBOT][${botStateObj.userId}] Último precio de orden: ${botStateObj.lastOrder?.price?.toFixed(2) ?? 'N/A'}`); // Use optional chaining

                currentSignal = 'BUY'; // While in BUYING state, the bot is actively looking to buy or cover.

                // Lógica para la venta POR INDICADOR cuando estamos en estado BUYING
                const analysisResultForSell = await bitmartIndicatorAnalyzer.runAnalysis(botStateObj.currentPrice);
                if (analysisResultForSell.action === 'SELL' && parseFloat(botStateObj.ac || 0) > 0) {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Indicador sugiere VENTA mientras estamos en BUYING. Transicionando a SELLING.`);
                    botStateObj.state = 'SELLING';
                    currentSignal = 'SELL';
                    // No return here, allow the selling logic in the SELLING state to be handled immediately.
                } else if (parseFloat(botStateObj.ac || 0) > 0) { // Ensure ac is a number
                    let nextUSDTAmount;
                    // Safely determine lastOrderUSDTAmount, default to purchase if not set
                    const lastUSDTAmount = parseFloat(botStateObj.lastOrderUSDTAmount || botStateObj.purchase || 0);
                    const incrementFactor = parseFloat(botStateObj.increment || 100) / 100; // Default to 100 for 100% (2x)

                    if (botStateObj.orderCountInCycle === 0) { // If it's the very first order in cycle
                        nextUSDTAmount = parseFloat(botStateObj.purchase || 0);
                    } else {
                        nextUSDTAmount = lastUSDTAmount * (1 + incrementFactor);
                    }
                    nextUSDTAmount = parseFloat(nextUSDTAmount.toFixed(2)); // Round for consistency

                    const lastOrderPrice = parseFloat(botStateObj.lastOrder?.price || botStateObj.ppc || botStateObj.currentPrice || 0); // Safely get last order price, fallback to PPC, then currentPrice
                    const decrementFactor = parseFloat(botStateObj.decrement || 1) / 100; // Default to 1 for 1%
                    const nextCoveragePrice = lastOrderPrice * (1 - decrementFactor);
                    const roundedNextCoveragePrice = parseFloat(nextCoveragePrice.toFixed(2)); // Round for consistency

                    console.log(`[DEBUG_COVERAGE] Próximo monto USDT: ${nextUSDTAmount.toFixed(2)}, Precio de última orden: ${lastOrderPrice.toFixed(2)}, Precio para próxima cobertura: ${roundedNextCoveragePrice.toFixed(2)} USDT.`);

                    if (availableUSDT < nextUSDTAmount || nextUSDTAmount < MIN_USDT_VALUE_FOR_BITMART) {
                        if (botStateObj.state !== 'NO_COVERAGE') {
                            console.warn(`[AUTOBOT][${botStateObj.userId}] Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto (${nextUSDTAmount.toFixed(2)} USDT) es menor al mínimo para la próxima orden de cobertura. Cambiando a NO_COVERAGE.`);
                            botStateObj.state = 'NO_COVERAGE';
                            botStateObj.nextCoverageUSDTAmount = nextUSDTAmount;
                            botStateObj.nextCoverageTargetPrice = roundedNextCoveragePrice;
                            currentSignal = 'HOLD'; // No coverage means we are waiting
                        }
                    } else if (botStateObj.currentPrice <= roundedNextCoveragePrice) {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Precio de cobertura alcanzado! Intentando colocar orden de cobertura.`);
                        botStateObj.nextCoverageUSDTAmount = nextUSDTAmount;
                        botStateObj.nextCoverageTargetPrice = roundedNextCoveragePrice;
                        await placeCoverageBuyOrder(botStateObj, bitmartCreds); // Pasar botStateObj y credenciales
                    } else {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Esperando precio para próxima cobertura o venta.`);
                        currentSignal = 'HOLD'; // Waiting for price drop for coverage
                    }
                } else if (parseFloat(botStateObj.ac || 0) === 0 && botStateObj.lastOrder && botStateObj.lastOrder.side === 'buy' && botStateObj.lastOrder.state !== 'filled') {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Esperando confirmación de la primera orden o actualización de AC (puede que la primera orden esté pendiente).`);
                    currentSignal = 'HOLD'; // Waiting for the initial buy to fill
                }
                break;

            case 'SELLING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: SELLING. Gestionando ventas...`);
                currentSignal = 'SELL'; // While in SELLING state, the bot is actively looking to sell.

                // Ensure pm, pv, pc are numbers and handle potential currentPrice issues
                botStateObj.pm = Math.max(parseFloat(botStateObj.pm || 0), parseFloat(botStateObj.currentPrice || 0)); // Ensure pm updates
                // Ajusta estos valores si quieres que pv/pc sean parámetros configurables
                botStateObj.pv = parseFloat((botStateObj.pm * (1 - 0.005)).toFixed(2)); // Calculate PV from PM, fixed 0.5% fallback
                botStateObj.pc = parseFloat((botStateObj.pm * (1 - 0.004)).toFixed(2)); // Calculate PC from PM, fixed 0.4% fallback

                if ((botStateObj.currentPrice <= botStateObj.pc) && parseFloat(botStateObj.ac || 0) > 0) { // Ensure ac is a number
                    console.log(`[AUTOBOT][${botStateObj.userId}] Condiciones de venta alcanzadas! Colocando orden de venta.`);
                    await placeSellOrder(botStateObj, bitmartCreds); // Pasar botStateObj y credenciales
                } else {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Esperando condiciones para la venta. Precio actual: ${botStateObj.currentPrice.toFixed(2)}, PM: ${botStateObj.pm.toFixed(2)}, PV: ${botStateObj.pv.toFixed(2)}, PC: ${botStateObj.pc.toFixed(2)}`);
                }
                break;

            case 'NO_COVERAGE':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: NO_COVERAGE. Esperando fondos para la próxima orden de ${parseFloat(botStateObj.nextCoverageUSDTAmount || 0).toFixed(2)} USDT @ ${parseFloat(botStateObj.nextCoverageTargetPrice || 0).toFixed(2)}.`);
                currentSignal = 'HOLD'; // El bot está en espera

                // --- Lógica para Transición a VENTA (Regla 2: Venta por TRIGGER) ---
                // Solo si hay activo comprado (AC > 0) para poder vender
                if (parseFloat(botStateObj.ac || 0) > 0) {
                    const ppcValue = parseFloat(botStateObj.ppc || 0);
                    const triggerPercentage = parseFloat(botStateObj.trigger || 0);

                    // Asegurarse de que PPC y TRIGGER sean válidos para evitar NaN
                    if (ppcValue > 0 && triggerPercentage > 0) {
                        const targetSellPrice = ppcValue * (1 + (triggerPercentage / 100));

                        if (botStateObj.currentPrice >= targetSellPrice) {
                            console.log(`[AUTOBOT][${botStateObj.userId}] Precio actual (${botStateObj.currentPrice.toFixed(2)} USDT) alcanzó o superó el objetivo de venta por TRIGGER (${targetSellPrice.toFixed(2)} USDT) desde NO_COVERAGE.`);
                            botStateObj.state = 'SELLING';
                            // No se usa 'break' aquí para que la lógica del 'case 'SELLING'' se evalúe inmediatamente
                            // en esta misma iteración de runBotLogic.
                            // Esto evita un retraso de 10 segundos para la venta.
                        }
                    } else {
                        console.warn(`[AUTOBOT][${botStateObj.userId}] PPC (${ppcValue}) o TRIGGER (${triggerPercentage}) inválidos en NO_COVERAGE. No se puede evaluar la condición de venta por TRIGGER.`);
                    }
                }

                // --- Lógica para Transición a COMPRA (Regla 1: Recuperación por Balance) ---
                // Se evalúa esta condición SOLO si no se ha cambiado a SELLING en la lógica anterior.
                // Esto asegura que la venta tenga prioridad si se cumplen las condiciones.
                if (botStateObj.state === 'NO_COVERAGE') { // Solo si aún estamos en NO_COVERAGE
                    const nextBuyAmount = parseFloat(botStateObj.nextCoverageUSDTAmount || 0);
                    if (availableUSDT >= nextBuyAmount && nextBuyAmount >= MIN_USDT_VALUE_FOR_BITMART) {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Fondos disponibles. Volviendo a estado BUYING para que se intente la orden de cobertura.`);
                        botStateObj.state = 'BUYING';
                    }
                }
                break; // <-- Siempre hay un break al final del case

            case 'STOPPED': // Este estado se mantiene
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: STOPPED. El bot está inactivo.`);
                currentSignal = 'DETENIDO'; // Indicates bot is stopped, not actively trading
                break;
            default:
                console.warn(`[AUTOBOT][${botStateObj.userId}] Estado desconocido del bot: ${botStateObj.state}. Estableciendo a STOPPED.`);
                botStateObj.state = 'STOPPED'; // Por defecto, cualquier estado desconocido lleva a STOPPED
                currentSignal = 'DETENIDO';
                break;
        }

        // Emitir el estado de la señal después de toda la lógica del bot
        if (ioInstance) {
            ioInstance.to(botStateObj.userId).emit('signalUpdate', { signal: currentSignal, userId: botStateObj.userId });
            console.log(`[AUTOBOT][${botStateObj.userId}] Señal emitida al frontend: ${currentSignal}`);
        }

        // Siempre guarda el estado después de cada ciclo de lógica
        await saveBotState(botStateObj);

    } catch (error) {
        console.error(`❌ Falló la ejecución de la lógica del bot para ${botStateObj.userId}:`, error.message);
        // Si el error es debido a credenciales inválidas, intenta detener el bot y notificar.
        if (error.message.includes('Error interno del servidor al obtener y desencriptar credenciales de BitMart') || error.message.includes('API keys not configured')) {
            console.error(`[AUTOBOT][${botStateObj.userId}] Credenciales de BitMart inválidas o no configuradas. Deteniendo el bot.`);
            if (botStateObj) {
                botStateObj.state = 'STOPPED'; // Se detiene el bot
                botStateObj.isRunning = false;
                await saveBotState(botStateObj);
                if (ioInstance) {
                    ioInstance.to(botStateObj.userId).emit('botError', { message: 'Credenciales de BitMart inválidas o no configuradas. Bot detenido.', userId: botStateObj.userId });
                    ioInstance.to(botStateObj.userId).emit('signalUpdate', { signal: 'ERROR_CREDENCIALES', userId: botStateObj.userId }); // Señal de error específica
                }
            }
        } else if (error.message.includes("Cannot read properties of undefined (reading 'toFixed')") || error.message.includes("is not a function")) {
            console.error(`[AUTOBOT][${botStateObj.userId}] Error crítico de tipo de dato (toFixed o similar). Volviendo a un estado operativo si es posible.`); // Mensaje ajustado
            if (botStateObj) {
                // En lugar de 'ERROR', intenta volver al estado 'RUNNING' o 'BUYING' para que reintente.
                // O si la situación es crítica, detén el bot.
                if (botStateObj.ac > 0) { // Si hay activo, intenta volver a BUYING para gestionar la posición
                    botStateObj.state = 'BUYING';
                } else { // Si no hay activo, vuelve a RUNNING para buscar entrada
                    botStateObj.state = 'RUNNING';
                }
                // Si prefieres que esto detenga el bot, cambia a: botStateObj.state = 'STOPPED'; botStateObj.isRunning = false;
                await saveBotState(botStateObj);
                if (ioInstance) {
                    ioInstance.to(botStateObj.userId).emit('botError', { message: `Error interno de cálculo. Bot intentando recuperarse en estado ${botStateObj.state}.`, userId: botStateObj.userId });
                    ioInstance.to(botStateObj.userId).emit('signalUpdate', { signal: 'ERROR_REINTENTO', userId: botStateObj.userId }); // Señal de reintento
                }
            }
        } else {
            // Manejo de errores generales: se intenta mantener el bot en su estado actual para que reintente en el siguiente ciclo.
            // Si el error es persistente, esto podría llevar a un loop, pero la idea es dar la menor intervención.
            console.error(`[AUTOBOT][${botStateObj.userId}] Error inesperado: ${error.message}. El bot intentará continuar en el próximo ciclo.`); // Mensaje ajustado
            if (ioInstance) {
                ioInstance.to(botStateObj.userId).emit('botError', { message: `Error inesperado: ${error.message}. Bot intentando continuar.`, userId: botStateObj.userId });
                ioInstance.to(botStateObj.userId).emit('signalUpdate', { signal: 'ERROR_INESPERADO', userId: botStateObj.userId });
            }
            // No cambiar el estado aquí, dejar que el bot reintente en el próximo tick con el mismo estado.
            // Si el error es crítico y recurrente, podría ser necesaria una detención externa o un límite de reintentos.
        }
        // Asegúrate de guardar el estado incluso en caso de error, si el estado fue modificado.
        if (botStateObj) {
            await saveBotState(botStateObj);
        }
    }
}

// Lógica para iniciar la estrategia del bot
const userBotIntervals = new Map(); // Mapa para almacenar los IDs de intervalo por userId

/**
 * Inicia la estrategia del bot para un usuario.
 * @param {string} userId - El ID del usuario.
 * @param {Object} botParams - Parámetros iniciales para el bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function startBotStrategy(userId, botParams, bitmartCreds) {
    console.log(`[AUTOBOT] Iniciando estrategia para el usuario: ${userId}`);
    let botState = await loadBotStateForUser(userId);

    // Update bot parameters from the frontend, ensuring numeric values are parsed
    botState.purchase = parseFloat(botParams.purchase || 0);
    botState.increment = parseFloat(botParams.increment || 0);
    botState.decrement = parseFloat(botParams.decrement || 0);
    botState.trigger = parseFloat(botParams.trigger || 0);
    botState.stopAtCycleEnd = botParams.stopAtCycleEnd; // Boolean value

    // Si el bot se reanuda desde un estado diferente a STOPPED/ERROR, y tiene AC, lo fuerza a BUYING
    // para continuar el ciclo existente. Si no tiene AC, inicia en RUNNING.
    if (parseFloat(botState.ac || 0) > 0) {
        botState.state = 'BUYING';
        console.log(`[AUTOBOT][${userId}] Bot reanudado con AC existente. Estado ajustado a BUYING.`);
    } else {
        botState.state = 'RUNNING'; // Establecer estado inicial a RUNNING si es un nuevo ciclo
        console.log(`[AUTOBOT][${userId}] Bot iniciando nuevo ciclo. Estado ajustado a RUNNING.`);
    }
    botState.isRunning = true;


    // Si es el inicio de un nuevo ciclo (AC=0), resetear variables del ciclo
    if (parseFloat(botState.ac || 0) === 0) { // Ensure ac is a number
        resetCycleVariables(botState);
        botState.cycle = 1; // Inicia el ciclo en 1 si no hay activo
    } else {
        console.log(`[AUTOBOT][${userId}] Reanudando bot con AC existente: ${parseFloat(botState.ac || 0).toFixed(8)} BTC. Estado: ${botState.state}`);
    }

    await saveBotState(botState); // Guarda el estado inicial de RUNNING o BUYING

    // Limpiar cualquier intervalo existente para este usuario
    if (userBotIntervals.has(userId)) {
        clearInterval(userBotIntervals.get(userId));
        userBotIntervals.delete(userId);
    }

    // Ejecutar la lógica del bot inmediatamente y luego en un intervalo
    await runBotLogic(botState, bitmartCreds); // Primera ejecución inmediata
    const intervalId = setInterval(async () => {
        // Recargar el estado del bot desde la DB en cada intervalo para asegurar que esté actualizado
        // (especialmente si hay múltiples instancias o manipulaciones externas)
        let latestBotState = await loadBotStateForUser(userId);
        // La condición para seguir corriendo no debe incluir 'ERROR' ya que lo hemos eliminado del switch
        if (latestBotState.isRunning && latestBotState.state !== 'STOPPED') {
            await runBotLogic(latestBotState, bitmartCreds);
        } else {
            console.log(`[AUTOBOT][${userId}] El bot no está en estado activo. Deteniendo intervalo.`);
            clearInterval(userBotIntervals.get(userId));
            userBotIntervals.delete(userId);
            // Asegúrate de que el estado en DB se refleje como STOPPED si no lo está ya.
            if (latestBotState.state !== 'STOPPED') {
                latestBotState.state = 'STOPPED';
                latestBotState.isRunning = false;
                await saveBotState(latestBotState);
            }
        }
    }, 10000); // Ejecutar cada 10 segundos

    userBotIntervals.set(userId, intervalId);
    console.log(`[AUTOBOT] Estrategia iniciada para ${userId} con intervalo ID: ${intervalId}`);
    return botState; // Devuelve el estado actualizado
}

/**
 * Detiene la estrategia del bot para un usuario.
 * @param {Object} botStateObj - El objeto del estado del bot a detener.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function stopBotStrategy(botStateObj, bitmartCreds) {
    console.log(`[AUTOBOT] Deteniendo estrategia para el usuario: ${botStateObj.userId}`);

    // Limpiar cualquier intervalo existente
    if (userBotIntervals.has(botStateObj.userId)) {
        clearInterval(userBotIntervals.get(botStateObj.userId));
        userBotIntervals.delete(botStateObj.userId);
        console.log(`[AUTOBOT] Intervalo de estrategia limpiado para ${botStateObj.userId}.`);
    } else {
        console.warn(`[AUTOBOT] No se encontró intervalo de estrategia activo para ${botStateObj.userId}.`);
    }

    // Cancelar órdenes abiertas al detener el bot
    await cancelOpenOrders(bitmartCreds, TRADE_SYMBOL); // Pasar credenciales

    botStateObj.state = 'STOPPED';
    botStateObj.isRunning = false; // Actualizar isRunning
    await saveBotState(botStateObj); // Guarda el estado actualizado
    console.log(`[AUTOBOT] Estrategia detenida y estado actualizado en DB para ${botStateObj.userId}.`);
    // Emitir que el bot está detenido al frontend
    if (ioInstance) {
        ioInstance.to(botStateObj.userId).emit('signalUpdate', { signal: 'DETENIDO', userId: botStateObj.userId });
        ioInstance.to(botStateObj.userId).emit('botStateUpdate', { botState: botStateObj.toObject(), userId: botStateObj.userId });
    }
    return botStateObj; // Devuelve el estado actualizado
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

// Exportar las funciones que se usarán en otros módulos
module.exports = {
    init, // Asegura que la función 'init' esté disponible para server.js
    loadBotStateForUser,
    saveBotState,
    toggleBotState,
    // Puedes exportar otras funciones si son necesarias externamente,
    // pero para la lógica del bot, estas son las principales.
};