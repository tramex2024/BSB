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

/**
 * Función para emitir mensajes de log al cliente (frontend)
 * @param {string} userId - El ID del usuario al que enviar el mensaje.
 * @param {string} message - El contenido del mensaje.
 * @param {string} type - El tipo de mensaje (info, success, warning, error).
 */
function emitLogMessage(userId, message, type = 'info') {
    if (ioInstance) {
        ioInstance.to(userId).emit('logMessage', {
            timestamp: new Date().toLocaleTimeString(),
            message: message,
            type: type
        });
        console.log(`[Log Enviado al Frontend] [${userId}] [${type}] ${message}`); // Log en el servidor para depuración
    } else {
        console.warn('Socket.IO no está inicializado en autobotLogic. No se pudo enviar el log al frontend.');
    }
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
                await botState.save(); // Guarda el cambio de estado en la DB
                emitLogMessage(userId, `El bot se ha reiniciado y está **DETENIDO**. Inícialo manualmente.`, 'warning');
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
        emitLogMessage(userId, `Error al cargar estado del bot: ${error.message}`, 'error');
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
        const stateToSave = { ...botStateObj };
        delete stateToSave.strategyIntervalId;

        await BotState.findOneAndUpdate(
            { userId: botStateObj.userId },
            stateToSave,
            { upsert: true, new: true } // Actualiza o crea, y devuelve el documento actualizado
        );
        console.log(`[DB] Estado del bot guardado para el usuario ${botStateObj.userId}.`);
    } catch (error) {
        console.error(`❌ Error guardando estado del bot para ${botStateObj.userId} en DB:`, error.message);
        emitLogMessage(botStateObj.userId, `Error al guardar estado del bot: ${error.message}`, 'error');
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
    emitLogMessage(bitmartCreds.userId, `Intentando cancelar órdenes abiertas para ${symbol}...`, 'info');
    console.log(`[AUTOBOT] Intentando cancelar órdenes abiertas para ${symbol}...`);
    try {
        // Usar las credenciales proporcionadas para las llamadas al servicio
        const openOrders = await bitmartService.getOpenOrders(bitmartCreds, symbol);
        if (openOrders && openOrders.orders && openOrders.orders.length > 0) {
            for (const order of openOrders.orders) {
                emitLogMessage(bitmartCreds.userId, `Cancelando orden: ${order.order_id}`, 'warning');
                console.log(`[AUTOBOT] Cancelando orden: ${order.order_id}`);
                await bitmartService.cancelOrder(bitmartCreds, symbol, order.order_id);
                console.log(`[AUTOBOT] Orden ${order.order_id} cancelada.`);
            }
            emitLogMessage(bitmartCreds.userId, `✅ Todas las ${openOrders.orders.length} órdenes abiertas para ${symbol} han sido canceladas.`, 'success');
            console.log(`[AUTOBOT] Todas las ${openOrders.orders.length} órdenes abiertas para ${symbol} han sido canceladas.`);
        } else {
            emitLogMessage(bitmartCreds.userId, 'No se encontraron órdenes abiertas para cancelar.', 'info');
            console.log('[AUTOBOT] No se encontraron órdenes abiertas para cancelar.');
        }
    } catch (error) {
        emitLogMessage(bitmartCreds.userId, `❌ Error al cancelar órdenes abiertas: ${error.message}`, 'error');
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
    emitLogMessage(botStateObj.userId, `Intentando colocar la primera orden de **COMPRA** (CICLO ${botStateObj.cycle})...`, 'info');
    console.log(`[AUTOBOT][${botStateObj.userId}] Intentando colocar la primera orden de compra (CICLO ${botStateObj.cycle})...`);
    const tradeSymbol = TRADE_SYMBOL;
    const orderType = 'market';
    const side = 'buy';
       
    const sizeUSDT = botStateObj.purchase; // Usar purchase del estado del bot
    console.log(`[DEBUG_ORDER] Tamaño de compra en USDT (purchaseAmount): ${sizeUSDT} USDT.`);

    // Obtener balance y precio actual para asegurar la compra
    const balanceInfo = await bitmartService.getBalance(bitmartCreds); // Pasar credenciales
    const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;

    emitLogMessage(botStateObj.userId, `Balance USDT disponible: ${availableUSDT.toFixed(2)} USDT.`, 'info');
    console.log(`[DEBUG_ORDER] Balance USDT disponible: ${availableUSDT.toFixed(2)} USDT.`);
    if (availableUSDT < sizeUSDT) {
        emitLogMessage(botStateObj.userId, `Balance insuficiente para la primera orden. Necesario: ${sizeUSDT} USDT, Disponible: ${availableUSDT.toFixed(2)} USDT.`, 'warning');
        console.warn(`[AUTOBOT][${botStateObj.userId}] Balance insuficiente para la primera orden. Necesario: ${sizeUSDT} USDT, Disponible: ${availableUSDT.toFixed(2)} USDT.`);
        botStateObj.state = 'NO_COVERAGE';
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }
    if (botStateObj.currentPrice === 0) {
        emitLogMessage(botStateObj.userId, `Precio actual no disponible para la primera orden. Reintentando...`, 'warning');
        console.error(`[AUTOBOT][${botStateObj.userId}] Precio actual no disponible para la primera orden. Reintentando...`);
        botStateObj.state = 'RUNNING'; // Sigue en RUNNING para reintentar la compra en el siguiente ciclo
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }

    let sizeBTC = sizeUSDT / botStateObj.currentPrice;
    sizeBTC = parseFloat(sizeBTC.toFixed(8)); // Redondear a 8 decimales para BTC
    console.log(`[DEBUG_ORDER] Tamaño calculado en BTC: ${sizeBTC} ${TRADE_SYMBOL.split('_')[0]}.`);

    if (sizeUSDT < MIN_USDT_VALUE_FOR_BITMART) {
        emitLogMessage(botStateObj.userId, `El valor de la orden (${sizeUSDT} USDT) es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART} USDT). Ajusta tu **PURCHASE** para reanudar el bot.`, 'error');
        console.error(`[AUTOBOT][${botStateObj.userId}] El valor de la orden (${sizeUSDT} USDT) es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART} USDT). Ajusta tu PURCHASE.`);
        botStateObj.state = 'STOPPED';
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }
    try {
        emitLogMessage(botStateObj.userId, `Colocando orden de **COMPRA (MARKET)**: ${sizeBTC.toFixed(8)} ${TRADE_SYMBOL.split('_')[0]} por ${sizeUSDT.toFixed(2)} USDT a precio de ${botStateObj.currentPrice.toFixed(2)} USDT.`, 'info');
        console.log(`[AUTOBOT][${botStateObj.userId}] Colocando orden de COMPRA (MARKET): ${sizeBTC.toFixed(8)} ${TRADE_SYMBOL.split('_')[0]} por ${sizeUSDT.toFixed(2)} USDT a precio de ${botStateObj.currentPrice.toFixed(2)} USDT.`);
           
        const orderResult = await bitmartService.placeOrder(bitmartCreds, tradeSymbol, side, orderType, sizeUSDT.toString());
           
        console.log('[DEBUG_ORDER] Resultado de la primera orden de compra:', orderResult);

        if (orderResult && orderResult.order_id) {
            // Espera simulada para que la orden se procese en el exchange.
            await new Promise(resolve => setTimeout(resolve, 2000)); 

            // Obtén los detalles reales de la orden ejecutada desde BitMart.
            const filledOrder = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, orderResult.order_id); // Pasar credenciales

            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price);
                const actualSize = parseFloat(filledOrder.filled_size);
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
                botStateObj.openOrders = botStateObj.openOrders.filter(o => o.orderId !== orderResult.order_id); // Eliminar de órdenes abiertas

                emitLogMessage(botStateObj.userId, `✅ Primera orden de COMPRA COMPLETA. Precio Promedio de Compra (PPC): ${botStateObj.ppc.toFixed(2)}, Costo Promedio (CP): ${botStateObj.cp.toFixed(2)}, Activo Comprado (AC): ${botStateObj.ac.toFixed(5)} ${TRADE_SYMBOL.split('_')[0]}. Órdenes en ciclo: ${botStateObj.orderCountInCycle}`, 'success');
                console.log(`[AUTOBOT][${botStateObj.userId}] Primera orden de compra COMPLETA. PPC: ${botStateObj.ppc.toFixed(2)}, CP: ${botStateObj.cp.toFixed(2)}, AC: ${botStateObj.ac.toFixed(5)} ${TRADE_SYMBOL.split('_')[0]}. Órdenes en ciclo: ${botStateObj.orderCountInCycle}`);
                botStateObj.state = 'BUYING'; // Cambia el estado a 'BUYING' para que el bot empiece a gestionar futuras compras/ventas
            } else {
                emitLogMessage(botStateObj.userId, `La primera orden ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}.`, 'warning');
                console.warn(`[AUTOBOT][${botStateObj.userId}] La primera orden ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
                botStateObj.state = 'RUNNING'; // Reintentar buscar punto de entrada
            }

        } else {
            emitLogMessage(botStateObj.userId, `❌ Error al colocar la primera orden: No se recibió order_id o la respuesta es inválida.`, 'error');
            console.error(`[AUTOBOT][${botStateObj.userId}] Error al colocar la primera orden: No se recibió order_id o la respuesta es inválida.`);
            botStateObj.state = 'RUNNING'; // Reintentar buscar punto de entrada
        }
    } catch (error) {
        emitLogMessage(botStateObj.userId, `❌ Excepción al colocar la primera orden: ${error.message}`, 'error');
        console.error(`[AUTOBOT][${botStateObj.userId}] Excepción al colocar la primera orden:`, error.message);
        botStateObj.state = 'RUNNING'; // Reintentar buscar punto de entrada
    }
}

/**
 * Coloca una orden de compra de cobertura (Limit).
 * @param {Object} botStateObj - El objeto del estado del bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function placeCoverageBuyOrder(botStateObj, bitmartCreds) {
    emitLogMessage(botStateObj.userId, `Intentando colocar orden de **COMPRA de COBERTURA** (CICLO ${botStateObj.cycle})...`, 'info');
    console.log(`[AUTOBOT][${botStateObj.userId}] Intentando colocar orden de compra de COBERTURA (CICLO ${botStateObj.cycle})...`);
    const tradeSymbol = TRADE_SYMBOL;
    const side = 'buy';
    const orderType = 'limit';
    const sizeUSDT = botStateObj.nextCoverageUSDTAmount;
    const targetPrice = botStateObj.nextCoverageTargetPrice;

    const balanceInfo = await bitmartService.getBalance(bitmartCreds); // Pasar credenciales
    const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;

    if (availableUSDT < sizeUSDT || sizeUSDT < MIN_USDT_VALUE_FOR_BITMART) {
        emitLogMessage(botStateObj.userId, `Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto de orden (${sizeUSDT.toFixed(2)} USDT) es menor al mínimo para orden de cobertura. Cambiando a **NO_COVERAGE**.`, 'warning');
        console.warn(`[AUTOBOT][${botStateObj.userId}] Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto de orden (${sizeUSDT.toFixed(2)} USDT) es menor al mínimo para orden de cobertura. Cambiando a NO_COVERAGE.`);
        botStateObj.state = 'NO_COVERAGE';
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }

    if (botStateObj.currentPrice === 0) {
        emitLogMessage(botStateObj.userId, `Precio actual no disponible para orden de cobertura.`, 'warning');
        console.error(`[AUTOBOT][${botStateObj.userId}] Precio actual no disponible para orden de cobertura.`);
        return;
    }

    let sizeBTC = sizeUSDT / targetPrice;
    sizeBTC = parseFloat(sizeBTC.toFixed(8));

    try {
        emitLogMessage(botStateObj.userId, `Colocando orden de **COMPRA (LIMIT)** de cobertura: ${sizeBTC.toFixed(8)} ${TRADE_SYMBOL.split('_')[0]} a ${targetPrice.toFixed(2)} USDT.`, 'info');
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
            emitLogMessage(botStateObj.userId, `Orden de cobertura colocada: ID ${orderResult.order_id}. Monitoreando...`, 'info');
            console.log(`[AUTOBOT][${botStateObj.userId}] Orden de cobertura colocada: ID ${orderResult.order_id}. Monitoreando...`);
               
            // Espera simulada para que la orden se procese en el exchange.
            await new Promise(resolve => setTimeout(resolve, 2000)); 

            const filledOrder = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, orderResult.order_id); // Pasar credenciales

            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price);
                const actualSize = parseFloat(filledOrder.adesc || filledOrder.filled_size); // Corregido: usar filled_size
                const actualAmountUSD = actualPrice * actualSize;

                // Actualizar PPC, CP, AC
                botStateObj.ac += actualSize;
                botStateObj.cp += actualAmountUSD;
                botStateObj.ppc = botStateObj.cp / botStateObj.ac;
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
                botStateObj.openOrders = botStateObj.openOrders.filter(o => o.orderId !== orderResult.order_id); // Eliminar de órdenes abiertas

                emitLogMessage(botStateObj.userId, `✅ Orden de cobertura COMPLETA. Nuevo AC: ${botStateObj.ac.toFixed(8)}, Nuevo CP: ${botStateObj.cp.toFixed(2)}, Nuevo PPC: ${botStateObj.ppc.toFixed(2)}. Órdenes en ciclo: ${botStateObj.orderCountInCycle}`, 'success');
                console.log(`[AUTOBOT][${botStateObj.userId}] Orden de cobertura COMPLETA. Nuevo AC: ${botStateObj.ac.toFixed(8)}, Nuevo CP: ${botStateObj.cp.toFixed(2)}, Nuevo PPC: ${botStateObj.ppc.toFixed(2)}. Ordenes en ciclo: ${botStateObj.orderCountInCycle}`);
                // botStateObj.state permanece en 'BUYING'
            } else {
                emitLogMessage(botStateObj.userId, `La orden de cobertura ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}.`, 'warning');
                console.warn(`[AUTOBOT][${botStateObj.userId}] La orden de cobertura ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
                // Podrías dejar la orden en openOrders y esperar su llenado en el próximo ciclo
            }

        } else {
            emitLogMessage(botStateObj.userId, `❌ Error al colocar orden de cobertura: No se recibió order_id o la respuesta es inválida.`, 'error');
            console.error(`[AUTOBOT][${botStateObj.userId}] Error al colocar orden de cobertura: No se recibió order_id o la respuesta es inválida.`);
        }
    } catch (error) {
        emitLogMessage(botStateObj.userId, `❌ Excepción al colocar orden de cobertura: ${error.message}`, 'error');
        console.error(`[AUTOBOT][${botStateObj.userId}] Excepción al colocar orden de cobertura:`, error.message);
    }
}

/**
 * Coloca una orden de venta (Market) para cerrar un ciclo.
 * @param {Object} botStateObj - El objeto del estado del bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function placeSellOrder(botStateObj, bitmartCreds) {
    emitLogMessage(botStateObj.userId, `Intentando colocar orden de **VENTA** (CICLO ${botStateObj.cycle})...`, 'info');
    console.log(`[AUTOBOT][${botStateObj.userId}] Intentando colocar orden de VENTA (CICLO ${botStateObj.cycle})...`);
    const tradeSymbol = TRADE_SYMBOL;
    const side = 'sell';
    const orderType = 'market';
    let sizeBTC = botStateObj.ac; // Vender todo el activo acumulado

    if (botStateObj.ac <= 0) {
        emitLogMessage(botStateObj.userId, `No hay activo para vender (AC = 0).`, 'warning');
        console.warn(`[AUTOBOT][${botStateObj.userId}] No hay activo para vender (AC = 0).`);
        botStateObj.state = 'RUNNING'; // Volver a RUNNING para buscar nueva entrada
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }

    try {
        emitLogMessage(botStateObj.userId, `Colocando orden de **VENTA (MARKET)**: ${sizeBTC.toFixed(8)} ${TRADE_SYMBOL.split('_')[0]} a precio de ${botStateObj.currentPrice.toFixed(2)} USDT.`, 'info');
        console.log(`[AUTOBOT][${botStateObj.userId}] Colocando orden de VENTA (MARKET): ${sizeBTC.toFixed(8)} ${TRADE_SYMBOL.split('_')[0]} a precio de ${botStateObj.currentPrice.toFixed(2)} USDT.`);
        const orderResult = await bitmartService.placeOrder(bitmartCreds, tradeSymbol, side, orderType, sizeBTC.toString()); // Pasar credenciales
           
        console.log('[DEBUG_ORDER] Resultado de la orden de venta:', orderResult);

        if (orderResult && orderResult.order_id) {
            emitLogMessage(botStateObj.userId, `Orden de **VENTA** colocada con éxito. ID de orden: ${orderResult.order_id}`, 'success');
            console.log(`[AUTOBOT][${botStateObj.userId}] Orden de VENTA colocada con éxito. ID de orden: ${orderResult.order_id}`);

            await cancelOpenOrders(bitmartCreds, TRADE_SYMBOL); // Cancelar órdenes de compra pendientes, pasando credenciales

            // Obtén los detalles reales de la orden ejecutada desde BitMart.
            const filledOrder = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, orderResult.order_id); // Pasar credenciales
               
            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price);
                const actualSize = parseFloat(filledOrder.adesc || filledOrder.filled_size); // Usar filled_size
                const revenueFromSale = actualPrice * actualSize;
                const commissionRate = 0.001; // 0.1% (Tasa de comisión de ejemplo, ajusta según BitMart)
                const buyCommission = botStateObj.cp * commissionRate;
                const sellCommission = revenueFromSale * commissionRate;

                botStateObj.cycleProfit = revenueFromSale - botStateObj.cp - buyCommission - sellCommission;
                botStateObj.profit += botStateObj.cycleProfit;

                emitLogMessage(botStateObj.userId, `Ciclo **${botStateObj.cycle}** completado. **Ganancia/Pérdida del ciclo:** ${botStateObj.cycleProfit.toFixed(2)} USDT. **Ganancia total:** ${botStateObj.profit.toFixed(2)} USDT.`, botStateObj.cycleProfit >= 0 ? 'success' : 'error');
                console.log(`[AUTOBOT][${botStateObj.userId}] Ciclo ${botStateObj.cycle} completado. Ganancia/Pérdida del ciclo: ${botStateObj.cycleProfit.toFixed(2)} USDT. Ganancia total: ${botStateObj.profit.toFixed(2)} USDT.`);

                // LÓGICA DE DETENCIÓN POR 'STOP ON CYCLE END'
                if (botStateObj.stopAtCycleEnd) { // Usar stopAtCycleEnd del botStateObj
                    emitLogMessage(botStateObj.userId, `Bandera "Stop on Cycle End" activada. **Deteniendo el bot** al final del ciclo.`, 'warning');
                    console.log(`[AUTOBOT][${botStateObj.userId}] Bandera "Stop on Cycle End" activada. Deteniendo el bot al final del ciclo.`);
                    // Asumiendo que stopBotStrategy ahora es asíncrono y guarda el estado
                    await stopBotStrategy(botStateObj, bitmartCreds); // Llama a la función de detención completa, pasando botStateObj y credenciales
                    return; // Salir después de detener el bot
                }

                resetCycleVariables(botStateObj); // Resetear variables para el nuevo ciclo
                botStateObj.cycle++; // Incrementar el ciclo para el nuevo inicio
                botStateObj.state = 'RUNNING'; // Volver a RUNNING para que espere la nueva señal de COMPRA
                emitLogMessage(botStateObj.userId, `Bot listo para el nuevo ciclo en estado **RUNNING**, esperando próxima señal de COMPRA.`, 'info');
                console.log(`[AUTOBOT][${botStateObj.userId}] Bot listo para el nuevo ciclo en estado RUNNING, esperando próxima señal de COMPRA.`);

            } else {
                emitLogMessage(botStateObj.userId, `La orden de venta ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}.`, 'warning');
                console.warn(`[AUTOBOT][${botStateObj.userId}] La orden de venta ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
            }

        } else {
            emitLogMessage(botStateObj.userId, `❌ Error al colocar la orden de venta: No se recibió order_id o la respuesta es inválida.`, 'error');
            console.error(`[AUTOBOT][${botStateObj.userId}] Error al colocar la orden de venta: No se recibió order_id o la respuesta es inválida.`, orderResult);
        }
    } catch (error) {
        emitLogMessage(botStateObj.userId, `❌ Excepción al colocar la orden de venta: ${error.message}`, 'error');
        console.error(`[AUTOBOT][${botStateObj.userId}] Excepción al colocar la orden de venta:`, error.message);
    }
}


/**
 * Función Principal de Lógica del Bot.
 * @param {Object} botStateObj - El objeto del estado del bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function runBotLogic(botStateObj, bitmartCreds) {
    emitLogMessage(botStateObj.userId, `--- Ejecutando ciclo de lógica del bot. Estado actual: **${botStateObj.state}** ---`, 'info');
    console.log(`\n--- Ejecutando lógica del bot para ${botStateObj.userId}. Estado actual: ${botStateObj.state} ---`);

    try {
        // Siempre obtén el precio actual al inicio de cada ejecución del loop
        const ticker = await bitmartService.getTicker(TRADE_SYMBOL);
        if (ticker && ticker.last) {
            botStateObj.currentPrice = parseFloat(ticker.last);
            emitLogMessage(botStateObj.userId, `Precio actual de BitMart: ${botStateObj.currentPrice.toFixed(2)} USDT`, 'info');
            console.log(`[AUTOBOT][${botStateObj.userId}] Precio actual de BitMart actualizado: ${botStateObj.currentPrice.toFixed(2)} USDT`);
        } else {
            emitLogMessage(botStateObj.userId, `No se pudo obtener el precio actual. Reintentando...`, 'warning');
            console.warn(`[AUTOBOT][${botStateObj.userId}] No se pudo obtener el precio actual. Reintentando...`);
            return; // Salir si no hay precio, para evitar errores en cálculos
        }

        // Obtener balance actualizado al inicio de cada ciclo para NO_COVERAGE y otras validaciones
        const balanceInfo = await bitmartService.getBalance(bitmartCreds); // Pasar credenciales
        const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
        const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;
        const btcBalance = balanceInfo.find(b => b.currency === 'BTC');
        const availableBTC = btcBalance ? parseFloat(btcBalance.available) : 0;

        // Emit balance update
        if (ioInstance) {
            ioInstance.to(botStateObj.userId).emit('balanceUpdate', { usdt: availableUSDT, btc: availableBTC });
        }
        emitLogMessage(botStateObj.userId, `Balances actuales: **USDT**: ${availableUSDT.toFixed(2)}, **${BASE_CURRENCY}**: ${availableBTC.toFixed(5)}`, 'info');


        // **LÓGICA DE VENTA PRIORITARIA (GLOBAL)**
        // Asegúrate de que botStateObj.triggerPercentage esté definido (ej. 1.5 para 1.5%)
        const expectedSellPrice = botStateObj.ppc * (1 + (botStateObj.trigger || 1.5) / 100); // Usar botStateObj.trigger para la venta
        if (botStateObj.ac > 0 && botStateObj.currentPrice >= expectedSellPrice && botStateObj.state !== 'SELLING') {
            emitLogMessage(botStateObj.userId, `¡**PRECIO DE VENTA GLOBAL ALCANZADO**! (${botStateObj.currentPrice.toFixed(2)} >= ${expectedSellPrice.toFixed(2)})`, 'success');
            console.log(`[AUTOBOT][${botStateObj.userId}] ¡PRECIO DE VENTA GLOBAL ALCANZADO! (${botStateObj.currentPrice.toFixed(2)} >= ${expectedSellPrice.toFixed(2)})`);
            // server/autobotLogic.js
// Este archivo contiene toda la lógica central del bot de trading,
// refactorizada para manejar el estado del bot por usuario.

const bitmartService = require('./services/bitmartService');
const BotState = require('./models/BotState');
const axios = require('axios'); // Necesitaremos axios si implementas indicadores reales

// ¡IMPORTA TU ANALIZADOR DE INDICADORES AQUÍ!
const bitmartIndicatorAnalyzer = require('./bitmart_indicator_analyzer');

// --- CONSTANTES DEL BOT ---
const TRADE_SYMBOL = 'BTC_USDT'; // Define el símbolo para las operaciones del bot
const MIN_USDT_VALUE_FOR_BITMART = 5; // Valor mínimo de USDT para una orden en BitMart
const BASE_CURRENCY = 'BTC'; // La moneda que operas
const QUOTE_CURRENCY = 'USDT'; // La moneda base para los cálculos de profit/purchase

// --- Nuevas Constantes Sugeridas ---
const COMMISSION_RATE = 0.001; // 0.1% (Tasa de comisión de ejemplo, ajusta según BitMart)
const SELL_STRATEGY_DECREMENT_PERCENTAGE = 0.5; // Porcentaje de decremento para PV (0.5% en tu código)
const SELL_STRATEGY_PC_DECREMENT_PERCENTAGE = 0.4; // Porcentaje de caída para PC (0.4% en tu código)
const ORDER_PROCESSING_DELAY_MS = 2000; // Retraso simulado para el procesamiento de órdenes
const BOT_INTERVAL_MS = 10000; // Intervalo de ejecución del bot (10 segundos)

// Referencia global para Socket.IO (se inyectará desde server.js)
let ioInstance;

/**
 * Inicializa el módulo con la instancia de Socket.IO.
 * @param {Object} io - La instancia de Socket.IO.
 */
function init(io) {
    ioInstance = io;
    console.log('[AUTOBOT] Socket.IO instance attached to autobotLogic.');
}

/**
 * Emite un mensaje de log al frontend del usuario a través de Socket.IO.
 * @param {string} userId - El ID del usuario.
 * @param {string} message - El mensaje a enviar.
 * @param {string} type - Tipo de mensaje (info, success, warning, error, debug).
 */
function emitLogMessage(userId, message, type = 'info') {
    if (ioInstance) {
        ioInstance.to(userId).emit('logMessage', {
            timestamp: new Date().toLocaleTimeString(),
            message: message,
            type: type
        });
    } else {
        console.warn('Socket.IO no está inicializado en autobotLogic. No se pudo enviar el log al frontend.');
    }
}

/**
 * Carga el estado del bot para un usuario específico desde la base de datos.
 * Si no existe, crea un nuevo estado por defecto.
 * @param {string} userId - El ID del usuario.
 * @returns {Promise<Object>} El objeto del estado del bot.
 */
async function loadBotStateForUser(userId) {
    try {
        let botState = await BotState.findOne({ userId });

        if (!botState) {
            console.log(`[DB] No se encontró estado de bot guardado para el usuario ${userId}. Creando uno nuevo con valores por defecto.`);
            botState = new BotState({ userId });
            await botState.save();
            console.log(`[DB] Nuevo estado de bot por defecto guardado para ${userId}.`);
        } else {
            console.log(`[DB] Estado de bot cargado desde la base de datos para el usuario ${userId}.`);
        }

        // Si el bot estaba en un estado activo antes de un reinicio del servidor,
        // lo ponemos en STOPPED para que el usuario lo inicie manualmente.
        // Esto previene que el bot se ejecute automáticamente si el servidor se reinicia.
        if (botState.state === 'RUNNING' || botState.state === 'BUYING' || botState.state === 'SELLING' || botState.state === 'NO_COVERAGE') {
            botState.state = 'STOPPED';
            botState.isRunning = false; // Asegura que isRunning también sea false
            await botState.save();
            emitLogMessage(userId, `El bot se ha reiniciado y está **DETENIDO**. Inícialo manualmente.`, 'warning');
            console.warn(`[DB] Bot de ${userId} estaba en estado activo. Se ha reiniciado en STOPPED y actualizado en DB. Por favor, inícielo manualmente.`);
        }
        
        return botState;
    } catch (error) {
        console.error(`❌ Error cargando estado del bot para el usuario ${userId} desde DB:`, error.message);
        emitLogMessage(userId, `Error al cargar estado del bot: ${error.message}`, 'error');
        // Retorna un nuevo estado por defecto en caso de error para evitar fallos.
        return new BotState({ userId });
    }
}

/**
 * Guarda el estado actual del bot en la base de datos.
 * @param {Object} botStateObj - El objeto del estado del bot a guardar.
 */
async function saveBotState(botStateObj) {
    try {
        // Creamos una copia para evitar mutar el original y eliminamos strategyIntervalId
        // ya que es un identificador de tiempo de ejecución y no debe ser persistido.
        const stateToSave = { ...botStateObj };
        delete stateToSave.strategyIntervalId;

        await BotState.findOneAndUpdate(
            { userId: botStateObj.userId },
            stateToSave,
            { upsert: true, new: true } // upsert: crea si no existe; new: retorna el documento actualizado
        );
        console.log(`[DB] Estado del bot guardado para el usuario ${botStateObj.userId}.`);
    } catch (error) {
        console.error(`❌ Error guardando estado del bot para ${botStateObj.userId} en DB:`, error.message);
        emitLogMessage(botStateObj.userId, `Error al guardar estado del bot: ${error.message}`, 'error');
    }
}

/**
 * Resetea las variables del ciclo de trading del bot.
 * @param {Object} botStateObj - El objeto del estado del bot.
 */
function resetCycleVariables(botStateObj) {
    console.log(`[AUTOBOT] Reseteando variables del ciclo para usuario ${botStateObj.userId}.`);
    botStateObj.ppc = 0; // Precio Promedio de Compra
    botStateObj.cp = 0;  // Costo Promedio
    botStateObj.ac = 0;  // Activo Comprado
    botStateObj.pm = 0;  // Precio Máximo
    botStateObj.pv = 0;  // Precio de Venta
    botStateObj.pc = 0;  // Precio de Caída (para la venta)
    botStateObj.lastOrder = null; // Última orden ejecutada
    botStateObj.openOrders = []; // Órdenes abiertas pendientes de monitoreo
    botStateObj.cycleProfit = 0; // Ganancia/pérdida del ciclo actual
    botStateObj.orderCountInCycle = 0; // Conteo de órdenes en el ciclo
    botStateObj.lastOrderUSDTAmount = 0; // Último monto en USDT de la orden
    botStateObj.nextCoverageUSDTAmount = 0; // Monto de la próxima cobertura
    botStateObj.nextCoverageTargetPrice = 0; // Precio objetivo de la próxima cobertura
    botStateObj.stopAtCycleEnd = false; // Reinicia la bandera para el próximo ciclo
}

/**
 * Cancela todas las órdenes abiertas para un símbolo específico.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 * @param {string} symbol - El símbolo de trading (ej. 'BTC_USDT').
 */
async function cancelOpenOrders(bitmartCreds, symbol) {
    emitLogMessage(bitmartCreds.userId, `Intentando cancelar órdenes abiertas para ${symbol}...`, 'info');
    console.log(`[AUTOBOT] Intentando cancelar órdenes abiertas para ${symbol}...`);
    try {
        const openOrders = await bitmartService.getOpenOrders(bitmartCreds, symbol);
        if (openOrders && openOrders.orders && openOrders.orders.length > 0) {
            // Usamos Promise.all para cancelar órdenes concurrentemente para mayor eficiencia.
            await Promise.all(openOrders.orders.map(async (order) => {
                try {
                    emitLogMessage(bitmartCreds.userId, `Cancelando orden: ${order.order_id}`, 'warning');
                    console.log(`[AUTOBOT] Cancelando orden: ${order.order_id}`);
                    await bitmartService.cancelOrder(bitmartCreds, symbol, order.order_id);
                    console.log(`[AUTOBOT] Orden ${order.order_id} cancelada.`);
                } catch (cancelError) {
                    emitLogMessage(bitmartCreds.userId, `❌ Error al cancelar orden ${order.order_id}: ${cancelError.message}`, 'error');
                    console.error(`[AUTOBOT] Error al cancelar orden ${order.order_id}:`, cancelError.message);
                }
            }));
            emitLogMessage(bitmartCreds.userId, `✅ Todas las ${openOrders.orders.length} órdenes abiertas para ${symbol} han sido procesadas para cancelación.`, 'success');
            console.log(`[AUTOBOT] Todas las ${openOrders.orders.length} órdenes abiertas para ${symbol} han sido procesadas para cancelación.`);
        } else {
            emitLogMessage(bitmartCreds.userId, 'No se encontraron órdenes abiertas para cancelar.', 'info');
            console.log('[AUTOBOT] No se encontraron órdenes abiertas para cancelar.');
        }
    } catch (error) {
        emitLogMessage(bitmartCreds.userId, `❌ Error general al obtener o cancelar órdenes abiertas: ${error.message}`, 'error');
        console.error('[AUTOBOT] Error general al obtener o cancelar órdenes abiertas:', error.message);
    }
}

/**
 * Coloca la primera orden de compra para iniciar un ciclo de trading.
 * @param {Object} botStateObj - El objeto del estado del bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function placeFirstBuyOrder(botStateObj, bitmartCreds) {
    emitLogMessage(botStateObj.userId, `Intentando colocar la primera orden de **COMPRA** (CICLO ${botStateObj.cycle})...`, 'info');
    console.log(`[AUTOBOT][${botStateObj.userId}] Intentando colocar la primera orden de compra (CICLO ${botStateObj.cycle})...`);
    const tradeSymbol = TRADE_SYMBOL;
    const orderType = 'market';
    const side = 'buy';
    
    const sizeUSDT = botStateObj.purchase; // Usar purchase del estado del bot
    console.log(`[DEBUG_ORDER] Tamaño de compra en USDT (purchaseAmount): ${sizeUSDT} USDT.`);

    try {
        const balanceInfo = await bitmartService.getBalance(bitmartCreds);
        const usdtBalance = balanceInfo.find(b => b.currency === QUOTE_CURRENCY);
        const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;

        emitLogMessage(botStateObj.userId, `Balance USDT disponible: ${availableUSDT.toFixed(2)} USDT.`, 'info');
        console.log(`[DEBUG_ORDER] Balance USDT disponible: ${availableUSDT.toFixed(2)} USDT.`);

        if (availableUSDT < sizeUSDT) {
            emitLogMessage(botStateObj.userId, `Balance insuficiente para la primera orden. Necesario: ${sizeUSDT} USDT, Disponible: ${availableUSDT.toFixed(2)} USDT.`, 'warning');
            console.warn(`[AUTOBOT][${botStateObj.userId}] Balance insuficiente para la primera orden. Necesario: ${sizeUSDT} USDT, Disponible: ${availableUSDT.toFixed(2)} USDT.`);
            botStateObj.state = 'NO_COVERAGE'; // Transiciona a NO_COVERAGE si los fondos son insuficientes
            botStateObj.nextCoverageUSDTAmount = sizeUSDT; 
            botStateObj.nextCoverageTargetPrice = botStateObj.currentPrice; // Establece el precio objetivo actual como fallback
            return; // Sale de la función, el estado se guardará en el bloque finally.
        }

        if (botStateObj.currentPrice === 0) {
            emitLogMessage(botStateObj.userId, `Precio actual no disponible para la primera orden. Reintentando...`, 'warning');
            console.error(`[AUTOBOT][${botStateObj.userId}] Precio actual no disponible para la primera orden. Reintentando...`);
            return; // Sale de la función, se reintentará en el próximo ciclo
        }

        const estimatedSizeBTC = sizeUSDT / botStateObj.currentPrice;
        console.log(`[DEBUG_ORDER] Tamaño estimado en BTC: ${estimatedSizeBTC.toFixed(8)} ${BASE_CURRENCY}.`);

        if (sizeUSDT < MIN_USDT_VALUE_FOR_BITMART) {
            emitLogMessage(botStateObj.userId, `El valor de la orden (${sizeUSDT} USDT) es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART} USDT). Ajusta tu **PURCHASE** para reanudar el bot.`, 'error');
            console.error(`[AUTOBOT][${botStateObj.userId}] El valor de la orden (${sizeUSDT} USDT) es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART} USDT). Ajusta tu PURCHASE.`);
            botStateObj.state = 'STOPPED';
            return; // Sale de la función, el estado se guardará en el bloque finally.
        }

        emitLogMessage(botStateObj.userId, `Colocando orden de **COMPRA (MARKET)**: ~${estimatedSizeBTC.toFixed(8)} ${BASE_CURRENCY} por ${sizeUSDT.toFixed(2)} USDT a precio de ${botStateObj.currentPrice.toFixed(2)} USDT.`, 'info');
        console.log(`[AUTOBOT][${botStateObj.userId}] Colocando orden de COMPRA (MARKET): ~${estimatedSizeBTC.toFixed(8)} ${BASE_CURRENCY} por ${sizeUSDT.toFixed(2)} USDT a precio de ${botStateObj.currentPrice.toFixed(2)} USDT.`);
        
        // Para una orden de mercado de compra, BitMart suele esperar el monto en la moneda base (USDT).
        const orderResult = await bitmartService.placeOrder(bitmartCreds, tradeSymbol, side, orderType, sizeUSDT.toFixed(2));
        
        console.log('[DEBUG_ORDER] Resultado de la primera orden de compra:', orderResult);

        if (orderResult && orderResult.order_id) {
            emitLogMessage(botStateObj.userId, `Orden de compra colocada: ID ${orderResult.order_id}. Esperando confirmación...`, 'info');
            // Espera un poco para que la orden se procese (simulación).
            // En un bot de producción real, se debería monitorear el estado de la orden.
            await new Promise(resolve => setTimeout(resolve, ORDER_PROCESSING_DELAY_MS));

            const filledOrder = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, orderResult.order_id);

            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price || botStateObj.currentPrice); // Si no hay precio, usa el actual
                const actualSize = parseFloat(filledOrder.filled_size);
                const actualAmountUSD = parseFloat(filledOrder.executed_volume || (actualPrice * actualSize));

                // Actualiza las variables de estado con los detalles de ejecución reales
                botStateObj.ppc = actualPrice; // El PPC de la primera orden es simplemente su precio
                botStateObj.cp = actualAmountUSD; // El CP de la primera orden es su costo
                botStateObj.ac = actualSize;
                botStateObj.cycle = 1; // Asegura que el ciclo comienza en 1
                botStateObj.orderCountInCycle = 1;
                botStateObj.lastOrderUSDTAmount = actualAmountUSD; // Almacena el monto real en USDT gastado

                botStateObj.lastOrder = {
                    orderId: orderResult.order_id,
                    price: actualPrice,
                    size: actualSize,
                    side: 'buy',
                    type: 'market',
                    state: 'filled',
                    timestamp: new Date().toISOString() // Añade un timestamp
                };
                // Asegúrate de que esta orden no esté en openOrders (para órdenes de mercado completadas rápidamente)
                botStateObj.openOrders = botStateObj.openOrders.filter(o => o.orderId !== orderResult.order_id);

                emitLogMessage(botStateObj.userId, `✅ Primera orden de COMPRA COMPLETA. PPC: ${botStateObj.ppc.toFixed(2)}, CP: ${botStateObj.cp.toFixed(2)}, AC: ${botStateObj.ac.toFixed(5)} ${BASE_CURRENCY}. Órdenes en ciclo: ${botStateObj.orderCountInCycle}`, 'success');
                console.log(`[AUTOBOT][${botStateObj.userId}] Primera orden de compra COMPLETA. PPC: ${botStateObj.ppc.toFixed(2)}, CP: ${botStateObj.cp.toFixed(2)}, AC: ${botStateObj.ac.toFixed(5)} ${BASE_CURRENCY}. Órdenes en ciclo: ${botStateObj.orderCountInCycle}`);
                botStateObj.state = 'BUYING'; // Cambia el estado a 'BUYING' para gestionar futuras compras/ventas
            } else {
                emitLogMessage(botStateObj.userId, `La primera orden ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}.`, 'warning');
                console.warn(`[AUTOBOT][${botStateObj.userId}] La primera orden ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
                botStateObj.state = 'RUNNING'; // Si no se completa, vuelve a RUNNING para reevaluar la señal de compra
                botStateObj.openOrders.push({ // Añade la orden a monitoreo si no se llenó
                    orderId: orderResult.order_id,
                    price: botStateObj.currentPrice, // Precio estimado
                    size: estimatedSizeBTC, // Tamaño estimado
                    side: side,
                    type: orderType,
                    state: 'new',
                    timestamp: new Date().toISOString()
                });
            }
        } else {
            emitLogMessage(botStateObj.userId, `❌ Error al colocar la primera orden: No se recibió order_id o la respuesta es inválida.`, 'error');
            console.error(`[AUTOBOT][${botStateObj.userId}] Error al colocar la primera orden: No se recibió order_id o la respuesta es inválida.`, orderResult);
            botStateObj.state = 'RUNNING'; // Reintentar buscar punto de entrada
        }
    } catch (error) {
        emitLogMessage(botStateObj.userId, `❌ Excepción al colocar la primera orden: ${error.message}`, 'error');
        console.error(`[AUTOBOT][${botStateObj.userId}] Excepción al colocar la primera orden:`, error.message);
        botStateObj.state = 'RUNNING'; // Reintentar buscar punto de entrada
    } finally {
        await saveBotState(botStateObj); // Siempre guarda el estado después de un intento
    }
}

/**
 * Coloca una orden de compra de cobertura (limit order).
 * @param {Object} botStateObj - El objeto del estado del bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function placeCoverageBuyOrder(botStateObj, bitmartCreds) {
    emitLogMessage(botStateObj.userId, `Intentando colocar orden de **COMPRA de COBERTURA** (CICLO ${botStateObj.cycle})...`, 'info');
    console.log(`[AUTOBOT][${botStateObj.userId}] Intentando colocar orden de compra de COBERTURA (CICLO ${botStateObj.cycle})...`);
    const tradeSymbol = TRADE_SYMBOL;
    const side = 'buy';
    const orderType = 'limit';
    const sizeUSDT = botStateObj.nextCoverageUSDTAmount;
    const targetPrice = botStateObj.nextCoverageTargetPrice;

    try {
        const balanceInfo = await bitmartService.getBalance(bitmartCreds);
        const usdtBalance = balanceInfo.find(b => b.currency === QUOTE_CURRENCY);
        const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;

        if (availableUSDT < sizeUSDT || sizeUSDT < MIN_USDT_VALUE_FOR_BITMART) {
            emitLogMessage(botStateObj.userId, `Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto de orden (${sizeUSDT.toFixed(2)} USDT) es menor al mínimo para orden de cobertura. Cambiando a **NO_COVERAGE**.`, 'warning');
            console.warn(`[AUTOBOT][${botStateObj.userId}] Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto de orden (${sizeUSDT.toFixed(2)} USDT) es menor al mínimo para orden de cobertura. Cambiando a NO_COVERAGE.`);
            botStateObj.state = 'NO_COVERAGE';
            return;
        }

        if (botStateObj.currentPrice === 0) {
            emitLogMessage(botStateObj.userId, `Precio actual no disponible para orden de cobertura.`, 'warning');
            console.error(`[AUTOBOT][${botStateObj.userId}] Precio actual no disponible para orden de cobertura.`);
            return;
        }

        let sizeBTC = sizeUSDT / targetPrice;
        sizeBTC = parseFloat(sizeBTC.toFixed(8)); // Mantiene 8 decimales para BTC para mayor precisión

        emitLogMessage(botStateObj.userId, `Colocando orden de **COMPRA (LIMIT)** de cobertura: ${sizeBTC.toFixed(8)} ${BASE_CURRENCY} a ${targetPrice.toFixed(2)} USDT.`, 'info');
        console.log(`[AUTOBOT][${botStateObj.userId}] Colocando orden de COMPRA (LIMIT) de cobertura: ${sizeBTC.toFixed(8)} ${BASE_CURRENCY} a ${targetPrice.toFixed(2)} USDT.`);
        
        // Para órdenes limitadas de compra, BitMart espera la cantidad de la moneda base (BTC)
        // y el precio.
        const orderResult = await bitmartService.placeOrder(bitmartCreds, tradeSymbol, side, orderType, sizeBTC.toFixed(8), targetPrice.toFixed(2));

        console.log(`[AUTOBOT][${botStateObj.userId}] Resultado de la orden de cobertura:`, orderResult);

        if (orderResult && orderResult.order_id) {
            const newOrder = {
                orderId: orderResult.order_id,
                price: targetPrice,
                size: sizeBTC,
                side: side,
                type: 'limit',
                state: 'new', // Estado inicial
                timestamp: new Date().toISOString()
            };
            botStateObj.openOrders.push(newOrder); // Añade a órdenes abiertas inmediatamente para monitoreo

            emitLogMessage(botStateObj.userId, `Orden de cobertura colocada: ID ${orderResult.order_id}. Monitoreando...`, 'info');
            console.log(`[AUTOBOT][${botStateObj.userId}] Orden de cobertura colocada: ID ${orderResult.order_id}. Monitoreando...`);
            
            // Para órdenes limitadas, el monitoreo continuo en runBotLogic es más efectivo.
            // Esta espera es solo para una verificación inicial rápida.
            await new Promise(resolve => setTimeout(resolve, ORDER_PROCESSING_DELAY_MS));

            const filledOrder = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, orderResult.order_id);

            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price || targetPrice);
                const actualSize = parseFloat(filledOrder.filled_size);
                const actualAmountUSD = parseFloat(filledOrder.executed_volume || (actualPrice * actualSize));

                // Actualiza PPC, CP, AC
                botStateObj.ac += actualSize;
                botStateObj.cp += actualAmountUSD;
                // Recalcula el PPC (Precio Promedio de Compra)
                botStateObj.ppc = botStateObj.ac > 0 ? botStateObj.cp / botStateObj.ac : 0;
                botStateObj.orderCountInCycle++;
                botStateObj.lastOrderUSDTAmount = actualAmountUSD;

                botStateObj.lastOrder = {
                    orderId: orderResult.order_id,
                    price: actualPrice,
                    size: actualSize,
                    side: side,
                    type: 'limit',
                    state: 'filled',
                    timestamp: new Date().toISOString()
                };
                // Remueve la orden completada de la lista de órdenes abiertas
                botStateObj.openOrders = botStateObj.openOrders.filter(o => o.orderId !== orderResult.order_id);

                emitLogMessage(botStateObj.userId, `✅ Orden de cobertura COMPLETA. Nuevo AC: ${botStateObj.ac.toFixed(8)}, Nuevo CP: ${botStateObj.cp.toFixed(2)}, Nuevo PPC: ${botStateObj.ppc.toFixed(2)}. Órdenes en ciclo: ${botStateObj.orderCountInCycle}`, 'success');
                console.log(`[AUTOBOT][${botStateObj.userId}] Orden de cobertura COMPLETA. Nuevo AC: ${botStateObj.ac.toFixed(8)}, Nuevo CP: ${botStateObj.cp.toFixed(2)}, Nuevo PPC: ${botStateObj.ppc.toFixed(2)}. Ordenes en ciclo: ${botStateObj.orderCountInCycle}`);
            } else {
                emitLogMessage(botStateObj.userId, `La orden de cobertura ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}. Se mantendrá en monitoreo.`, 'warning');
                console.warn(`[AUTOBOT][${botStateObj.userId}] La orden de cobertura ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}. Se mantendrá en monitoreo.`);
                // La orden sigue en botStateObj.openOrders y se verificará en futuros ciclos de runBotLogic.
            }
        } else {
            emitLogMessage(botStateObj.userId, `❌ Error al colocar orden de cobertura: No se recibió order_id o la respuesta es inválida.`, 'error');
            console.error(`[AUTOBOT][${botStateObj.userId}] Error al colocar orden de cobertura: No se recibió order_id o la respuesta es inválida.`, orderResult);
        }
    } catch (error) {
        emitLogMessage(botStateObj.userId, `❌ Excepción al colocar orden de cobertura: ${error.message}`, 'error');
        console.error(`[AUTOBOT][${botStateObj.userId}] Excepción al colocar orden de cobertura:`, error.message);
    } finally {
        await saveBotState(botStateObj);
    }
}

/**
 * Coloca una orden de venta de mercado para liquidar el activo acumulado.
 * @param {Object} botStateObj - El objeto del estado del bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function placeSellOrder(botStateObj, bitmartCreds) {
    emitLogMessage(botStateObj.userId, `Intentando colocar orden de **VENTA** (CICLO ${botStateObj.cycle})...`, 'info');
    console.log(`[AUTOBOT][${botStateObj.userId}] Intentando colocar orden de VENTA (CICLO ${botStateObj.cycle})...`);
    const tradeSymbol = TRADE_SYMBOL;
    const side = 'sell';
    const orderType = 'market';
    let sizeBTC = botStateObj.ac; // Vender todo el activo acumulado

    try {
        if (botStateObj.ac <= 0) {
            emitLogMessage(botStateObj.userId, `No hay activo para vender (AC = 0). Volviendo a RUNNING.`, 'warning');
            console.warn(`[AUTOBOT][${botStateObj.userId}] No hay activo para vender (AC = 0). Volviendo a RUNNING.`);
            botStateObj.state = 'RUNNING'; // Vuelve a RUNNING para buscar una nueva entrada
            resetCycleVariables(botStateObj); // Resetea las variables si no hay activo para vender
            return;
        }

        // Obtener el balance disponible de BTC para asegurar que tenemos suficiente para vender
        const balanceInfo = await bitmartService.getBalance(bitmartCreds);
        const btcBalance = balanceInfo.find(b => b.currency === BASE_CURRENCY);
        const availableBTC = btcBalance ? parseFloat(btcBalance.available) : 0;

        // Asegurarse de que la cantidad a vender no excede el balance disponible.
        // También manejar mínimos/máximos de la plataforma si BitMart tiene reglas para cantidades mínimas de venta.
        sizeBTC = Math.min(sizeBTC, availableBTC); // Vende como máximo lo que tienes disponible

        if (sizeBTC <= 0) { // Considera también el mínimo de BitMart para tamaño de orden
             emitLogMessage(botStateObj.userId, `Cantidad de ${BASE_CURRENCY} a vender es insuficiente o cero (${sizeBTC.toFixed(8)}). Volviendo a RUNNING.`, 'warning');
             console.warn(`[AUTOBOT][${botStateObj.userId}] Cantidad de ${BASE_CURRENCY} a vender es insuficiente o cero. Volviendo a RUNNING.`);
             botStateObj.state = 'RUNNING';
             resetCycleVariables(botStateObj);
             return;
        }


        emitLogMessage(botStateObj.userId, `Colocando orden de **VENTA (MARKET)**: ${sizeBTC.toFixed(8)} ${BASE_CURRENCY} a precio de ${botStateObj.currentPrice.toFixed(2)} ${QUOTE_CURRENCY}.`, 'info');
        console.log(`[AUTOBOT][${botStateObj.userId}] Colocando orden de VENTA (MARKET): ${sizeBTC.toFixed(8)} ${BASE_CURRENCY} a precio de ${botStateObj.currentPrice.toFixed(2)} ${QUOTE_CURRENCY}.`);
        
        // Para una orden de mercado de venta, BitMart espera la cantidad de la moneda base (BTC) a vender.
        const orderResult = await bitmartService.placeOrder(bitmartCreds, tradeSymbol, side, orderType, sizeBTC.toFixed(8));

        console.log('[DEBUG_ORDER] Resultado de la orden de venta:', orderResult);

        if (orderResult && orderResult.order_id) {
            emitLogMessage(botStateObj.userId, `Orden de **VENTA** colocada con éxito. ID de orden: ${orderResult.order_id}`, 'success');
            console.log(`[AUTOBOT][${botStateObj.userId}] Orden de VENTA colocada con éxito. ID de orden: ${orderResult.order_id}`);

            // Espera un poco y luego verifica el estado. En producción, se debe monitorear continuamente.
            await new Promise(resolve => setTimeout(resolve, ORDER_PROCESSING_DELAY_MS));

            const filledOrder = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, orderResult.order_id);
            
            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                // Cancela todas las órdenes de compra abiertas pendientes, ya que el ciclo ha terminado.
                await cancelOpenOrders(bitmartCreds, TRADE_SYMBOL);

                const actualPrice = parseFloat(filledOrder.price || botStateObj.currentPrice);
                const actualSize = parseFloat(filledOrder.filled_size);
                const revenueFromSale = parseFloat(filledOrder.executed_volume || (actualPrice * actualSize));

                // Calcula la comisión de compra y venta
                const buyCommission = botStateObj.cp * COMMISSION_RATE;
                const sellCommission = revenueFromSale * COMMISSION_RATE;

                botStateObj.cycleProfit = revenueFromSale - botStateObj.cp - buyCommission - sellCommission;
                botStateObj.profit += botStateObj.cycleProfit; // Acumula la ganancia total

                emitLogMessage(botStateObj.userId, `Ciclo **${botStateObj.cycle}** completado. **Ganancia/Pérdida del ciclo:** ${botStateObj.cycleProfit.toFixed(2)} ${QUOTE_CURRENCY}. **Ganancia total:** ${botStateObj.profit.toFixed(2)} ${QUOTE_CURRENCY}.`, botStateObj.cycleProfit >= 0 ? 'success' : 'error');
                console.log(`[AUTOBOT][${botStateObj.userId}] Ciclo ${botStateObj.cycle} completado. Ganancia/Pérdida del ciclo: ${botStateObj.cycleProfit.toFixed(2)} ${QUOTE_CURRENCY}. Ganancia total: ${botStateObj.profit.toFixed(2)} ${QUOTE_CURRENCY}.`);

                if (botStateObj.stopAtCycleEnd) {
                    emitLogMessage(botStateObj.userId, `Bandera "Stop on Cycle End" activada. **Deteniendo el bot** al final del ciclo.`, 'warning');
                    console.log(`[AUTOBOT][${botStateObj.userId}] Bandera "Stop on Cycle End" activada. Deteniendo el bot al final del ciclo.`);
                    await stopBotStrategy(botStateObj, bitmartCreds); // Llama a la función de detención completa
                    return;
                }

                resetCycleVariables(botStateObj); // Reinicia las variables para un nuevo ciclo
                botStateObj.cycle++; // Incrementa el número de ciclo
                botStateObj.state = 'RUNNING'; // Vuelve a RUNNING para el próximo ciclo
                emitLogMessage(botStateObj.userId, `Bot listo para el nuevo ciclo en estado **RUNNING**, esperando próxima señal de COMPRA.`, 'info');
                console.log(`[AUTOBOT][${botStateObj.userId}] Bot listo para el nuevo ciclo en estado RUNNING, esperando próxima señal de COMPRA.`);

            } else {
                emitLogMessage(botStateObj.userId, `La orden de venta ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}.`, 'warning');
                console.warn(`[AUTOBOT][${botStateObj.userId}] La orden de venta ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
                // Si la orden de venta no se completa, el bot permanece en estado 'SELLING' para reintentar la venta.
            }

        } else {
            emitLogMessage(botStateObj.userId, `❌ Error al colocar la orden de venta: No se recibió order_id o la respuesta es inválida.`, 'error');
            console.error(`[AUTOBOT][${botStateObj.userId}] Error al colocar la orden de venta: No se recibió order_id o la respuesta es inválida.`, orderResult);
        }
    } catch (error) {
        emitLogMessage(botStateObj.userId, `❌ Excepción al colocar la orden de venta: ${error.message}`, 'error');
        console.error(`[AUTOBOT][${botStateObj.userId}] Excepción al colocar la orden de venta:`, error.message);
    } finally {
        await saveBotState(botStateObj); // Siempre guarda el estado
    }
}

/**
 * Ejecuta la lógica principal del bot en cada ciclo.
 * @param {Object} botStateObj - El objeto del estado del bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function runBotLogic(botStateObj, bitmartCreds) {
    emitLogMessage(botStateObj.userId, `--- Ejecutando ciclo de lógica del bot. Estado actual: **${botStateObj.state}** ---`, 'info');
    console.log(`\n--- Ejecutando lógica del bot para ${botStateObj.userId}. Estado actual: ${botStateObj.state} ---`);

    try {
        // 1. Obtener precio actual
        const ticker = await bitmartService.getTicker(TRADE_SYMBOL);
        if (ticker && ticker.last) {
            botStateObj.currentPrice = parseFloat(ticker.last);
            emitLogMessage(botStateObj.userId, `Precio actual de BitMart: ${botStateObj.currentPrice.toFixed(2)} ${QUOTE_CURRENCY}`, 'info');
            console.log(`[AUTOBOT][${botStateObj.userId}] Precio actual de BitMart actualizado: ${botStateObj.currentPrice.toFixed(2)} ${QUOTE_CURRENCY}`);
        } else {
            emitLogMessage(botStateObj.userId, `No se pudo obtener el precio actual. Reintentando...`, 'warning');
            console.warn(`[AUTOBOT][${botStateObj.userId}] No se pudo obtener el precio actual. Reintentando...`);
            // Si el precio actual es crítico y no está disponible (ej. es 0 o null)
            if (!botStateObj.currentPrice || botStateObj.currentPrice === 0) {
                emitLogMessage(botStateObj.userId, `No se pudo obtener el precio actual. El bot no puede operar sin un precio válido.`, 'error');
                console.error(`[AUTOBOT][${botStateObj.userId}] No se pudo obtener el precio actual. Bot no puede operar sin precio.`);
                return; // Sale si el precio es indispensable y no se obtuvo
            }
        }

        // 2. Obtener balances
        const balanceInfo = await bitmartService.getBalance(bitmartCreds);
        const usdtBalance = balanceInfo.find(b => b.currency === QUOTE_CURRENCY);
        const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;
        const btcBalance = balanceInfo.find(b => b.currency === BASE_CURRENCY);
        const availableBTC = btcBalance ? parseFloat(btcBalance.available) : 0;

        // 3. Emitir actualizaciones al frontend
        if (ioInstance) {
            ioInstance.to(botStateObj.userId).emit('balanceUpdate', { usdt: availableUSDT, btc: availableBTC });
            ioInstance.to(botStateObj.userId).emit('botStateUpdate', botStateObj); // Envía el objeto de estado completo
        }
        emitLogMessage(botStateObj.userId, `Balances actuales: **USDT**: ${availableUSDT.toFixed(2)}, **${BASE_CURRENCY}**: ${availableBTC.toFixed(5)}`, 'info');

        // 4. Monitorear órdenes abiertas (especialmente para órdenes LIMIT)
        if (botStateObj.openOrders && botStateObj.openOrders.length > 0) {
            emitLogMessage(botStateObj.userId, `Monitoreando ${botStateObj.openOrders.length} órdenes abiertas...`, 'info');
            // Recorrer las órdenes en reversa para poder eliminar elementos con splice
            for (let i = botStateObj.openOrders.length - 1; i >= 0; i--) {
                const openOrder = botStateObj.openOrders[i];
                try {
                    const currentOrderDetails = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, openOrder.orderId);
                    if (currentOrderDetails && (currentOrderDetails.state === 'filled' || currentOrderDetails.state === 'fully_filled')) {
                        const actualPrice = parseFloat(currentOrderDetails.price || openOrder.price);
                        const actualSize = parseFloat(currentOrderDetails.filled_size);
                        const actualAmountUSD = parseFloat(currentOrderDetails.executed_volume || (actualPrice * actualSize));

                        // Actualizar estado basado en la orden completada
                        if (openOrder.side === 'buy') {
                            botStateObj.ac += actualSize;
                            botStateObj.cp += actualAmountUSD;
                            botStateObj.ppc = botStateObj.ac > 0 ? botStateObj.cp / botStateObj.ac : 0;
                            botStateObj.orderCountInCycle++;
                            botStateObj.lastOrderUSDTAmount = actualAmountUSD;
                            emitLogMessage(botStateObj.userId, `✅ Orden de COMPRA ID ${openOrder.orderId} COMPLETA. Nuevo AC: ${botStateObj.ac.toFixed(8)}, Nuevo CP: ${botStateObj.cp.toFixed(2)}, Nuevo PPC: ${botStateObj.ppc.toFixed(2)}.`, 'success');
                        } else if (openOrder.side === 'sell') {
                            // Si una orden de venta abierta se completó aquí, esto es inesperado.
                            // La lógica de venta debería haber manejado esto en placeSellOrder.
                            // Podría significar que una venta anterior se completó después del setTimeout inicial.
                            emitLogMessage(botStateObj.userId, `Advertencia: Orden de VENTA ID ${openOrder.orderId} completada fuera del flujo esperado de placeSellOrder.`, 'warning');
                        }

                        botStateObj.lastOrder = {
                            orderId: openOrder.orderId,
                            price: actualPrice,
                            size: actualSize,
                            side: openOrder.side,
                            type: openOrder.type,
                            state: 'filled',
                            timestamp: new Date().toISOString()
                        };
                        botStateObj.openOrders.splice(i, 1); // Elimina la orden completada
                        console.log(`[AUTOBOT][${botStateObj.userId}] Orden abierta ID ${openOrder.orderId} COMPLETA.`);
                    } else if (currentOrderDetails && (currentOrderDetails.state === 'canceled' || currentOrderDetails.state === 'failed')) {
                        emitLogMessage(botStateObj.userId, `Orden abierta ID ${openOrder.orderId} fue ${currentOrderDetails.state}. Removiendo de monitoreo.`, 'warning');
                        console.warn(`[AUTOBOT][${botStateObj.userId}] Orden abierta ID ${openOrder.orderId} fue ${currentOrderDetails.state}.`);
                        botStateObj.openOrders.splice(i, 1); // Elimina la orden fallida/cancelada
                    } else {
                        emitLogMessage(botStateObj.userId, `Orden abierta ID ${openOrder.orderId} sigue pendiente. Estado: ${currentOrderDetails ? currentOrderDetails.state : 'Desconocido'}.`, 'info');
                        console.log(`[AUTOBOT][${botStateObj.userId}] Orden abierta ID ${openOrder.orderId} sigue pendiente.`);
                    }
                } catch (orderError) {
                    emitLogMessage(botStateObj.userId, `❌ Error al verificar orden ${openOrder.orderId}: ${orderError.message}`, 'error');
                    console.error(`[AUTOBOT][${botStateObj.userId}] Error al verificar orden ${openOrder.orderId}:`, orderError.message);
                    // Mantiene la orden en openOrders, podría ser un error temporal de la API
                }
            }
        }

        // 5. **LÓGICA DE VENTA PRIORITARIA (GLOBAL)**
        // Esta verificación solo se activa si el bot tiene activos (AC > 0)
        // y no está ya en el proceso de venta.
        const expectedSellPrice = botStateObj.ppc * (1 + (botStateObj.trigger || 1.5) / 100);
        if (botStateObj.ac > 0 && botStateObj.currentPrice >= expectedSellPrice && botStateObj.state !== 'SELLING') {
            emitLogMessage(botStateObj.userId, `¡**PRECIO DE VENTA GLOBAL ALCANZADO**! (${botStateObj.currentPrice.toFixed(2)} >= ${expectedSellPrice.toFixed(2)})`, 'success');
            console.log(`[AUTOBOT][${botStateObj.userId}] ¡PRECIO DE VENTA GLOBAL ALCANZADO! (${botStateObj.currentPrice.toFixed(2)} >= ${expectedSellPrice.toFixed(2)})`);
            emitLogMessage(botStateObj.userId, `Transicionando a **SELLING** para ejecutar la estrategia de venta.`, 'info');
            console.log(`[AUTOBOT][${botStateObj.userId}] Transicionando a SELLING para ejecutar la estrategia de venta.`);
            botStateObj.state = 'SELLING';
            // Continúa al switch case para ejecutar la lógica de venta en este mismo ciclo
        }

        // 6. Lógica principal del bot según el estado
        switch (botStateObj.state) {
            case 'RUNNING':
                emitLogMessage(botStateObj.userId, `Estado: **RUNNING**. Esperando señal de entrada de COMPRA desde el analizador de indicadores...`, 'info');
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: RUNNING. Esperando señal de entrada de COMPRA desde el analizador de indicadores...`);

                if (botStateObj.ac > 0) {
                    emitLogMessage(botStateObj.userId, `Detectado AC > 0 en estado RUNNING. Transicionando a **BUYING** para reanudar ciclo.`, 'warning');
                    console.warn(`[AUTOBOT][${botStateObj.userId}] Detectado AC > 0 en estado RUNNING. Transicionando a BUYING para reanudar ciclo.`);
                    botStateObj.state = 'BUYING'; // Pasa a BUYING para gestionar la posición existente
                } else {
                    const analysisResult = await bitmartIndicatorAnalyzer.runAnalysis(botStateObj.currentPrice);
                    
                    emitLogMessage(botStateObj.userId, `Análisis técnico: **${analysisResult.action}**. Razón: ${analysisResult.reason}.`, analysisResult.action === 'COMPRA' ? 'success' : analysisResult.action === 'VENTA' ? 'error' : 'info');
                    
                    console.log(`[AUTOBOT][${botStateObj.userId}] Analizador de indicadores resultado: ${analysisResult.action} - Razón: ${analysisResult.reason}`);

                    if (analysisResult.action === 'COMPRA') {
                        emitLogMessage(botStateObj.userId, `¡Señal de entrada de **COMPRA DETECTADA** por los indicadores!`, 'success');
                        console.log(`[AUTOBOT][${botStateObj.userId}] ¡Señal de entrada de COMPRA DETECTADA por los indicadores!`);
                        // Verifica si hay fondos suficientes y el monto es mayor al mínimo
                        if (availableUSDT >= botStateObj.purchase && botStateObj.purchase >= MIN_USDT_VALUE_FOR_BITMART) {
                            botStateObj.state = 'BUYING'; // Cambia el estado a BUYING
                            await placeFirstBuyOrder(botStateObj, bitmartCreds); // Coloca la primera orden
                        } else {
                            emitLogMessage(botStateObj.userId, `No hay suficiente USDT para la primera orden. Necesario: ${botStateObj.purchase} USDT (mínimo ${MIN_USDT_VALUE_FOR_BITMART}), Disponible: ${availableUSDT.toFixed(2)} USDT. Cambiando a **NO_COVERAGE**.`, 'error');
                            console.warn(`[AUTOBOT][${botStateObj.userId}] No hay suficiente USDT para la primera orden. Necesario: ${botStateObj.purchase} USDT (mínimo ${MIN_USDT_VALUE_FOR_BITMART}), Disponible: ${availableUSDT.toFixed(2)} USDT. Cambiando a NO_COVERAGE.`);
                            botStateObj.state = 'NO_COVERAGE';
                            botStateObj.nextCoverageUSDTAmount = botStateObj.purchase;
                            botStateObj.nextCoverageTargetPrice = botStateObj.currentPrice;
                        }
                    } else {
                        emitLogMessage(botStateObj.userId, `Esperando una señal de **COMPRA** de los indicadores.`, 'info');
                        console.log(`[AUTOBOT][${botStateObj.userId}] Esperando una señal de COMPRA de los indicadores.`);
                    }
                }
                break;

            case 'BUYING':
                emitLogMessage(botStateObj.userId, `Estado: **BUYING**. Gestionando compras y coberturas...`, 'info');
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: BUYING. Gestionando compras y coberturas...`);
                emitLogMessage(botStateObj.userId, `PPC: ${botStateObj.ppc.toFixed(2)}, CP: ${botStateObj.cp.toFixed(2)}, AC: ${botStateObj.ac.toFixed(8)} ${BASE_CURRENCY}`, 'info');
                console.log(`[AUTOBOT][${botStateObj.userId}] PPC: ${botStateObj.ppc.toFixed(2)}, CP: ${botStateObj.cp.toFixed(2)}, AC: ${botStateObj.ac.toFixed(8)} ${BASE_CURRENCY}`);
                emitLogMessage(botStateObj.userId, `Último precio de orden: ${botStateObj.lastOrder ? botStateObj.lastOrder.price.toFixed(2) : 'N/A'}`, 'info');
                console.log(`[AUTOBOT][${botStateObj.userId}] Último precio de orden: ${botStateObj.lastOrder ? botStateObj.lastOrder.price.toFixed(2) : 'N/A'}`);
                
                if (botStateObj.ac > 0) { // Solo procede con la lógica de cobertura si hay activo
                    let nextUSDTAmount;
                    // Calcula el monto de la próxima orden de cobertura
                    if (botStateObj.orderCountInCycle === 0 || !botStateObj.lastOrderUSDTAmount || botStateObj.lastOrderUSDTAmount === 0) {
                        nextUSDTAmount = botStateObj.purchase;
                    } else {
                        nextUSDTAmount = botStateObj.lastOrderUSDTAmount * (1 + (botStateObj.increment || 100) / 100); // Usa botStateObj.increment
                    }
                    
                    const lastOrderPrice = botStateObj.lastOrder ? botStateObj.lastOrder.price : botStateObj.ppc;
                    const nextCoveragePrice = lastOrderPrice * (1 - (botStateObj.decrement || 1) / 100); // Usa botStateObj.decrement

                    emitLogMessage(botStateObj.userId, `DEBUG_COVERAGE: Próximo monto USDT: ${nextUSDTAmount.toFixed(2)}, Precio de última orden: ${lastOrderPrice.toFixed(2)}, Precio para próxima cobertura: ${nextCoveragePrice.toFixed(2)} ${QUOTE_CURRENCY}.`, 'debug');
                    console.log(`[DEBUG_COVERAGE] Próximo monto USDT: ${nextUSDTAmount.toFixed(2)}, Precio de última orden: ${lastOrderPrice.toFixed(2)}, Precio para próxima cobertura: ${nextCoveragePrice.toFixed(2)} ${QUOTE_CURRENCY}.`);

                    // Verifica si ya hay órdenes de compra limitadas pendientes
                    const hasPendingBuyLimitOrder = botStateObj.openOrders.some(o => o.side === 'buy' && o.type === 'limit');

                    if (availableUSDT < nextUSDTAmount || nextUSDTAmount < MIN_USDT_VALUE_FOR_BITMART) {
                        if (botStateObj.state !== 'NO_COVERAGE') { // Evita transiciones repetidas a NO_COVERAGE
                            emitLogMessage(botStateObj.userId, `Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto (${nextUSDTAmount.toFixed(2)} USDT) es menor al mínimo para la próxima orden de cobertura. Cambiando a **NO_COVERAGE**.`, 'error');
                            console.warn(`[AUTOBOT][${botStateObj.userId}] Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto (${nextUSDTAmount.toFixed(2)} USDT) es menor al mínimo para la próxima orden de cobertura. Cambiando a NO_COVERAGE.`);
                            botStateObj.state = 'NO_COVERAGE';
                            botStateObj.nextCoverageUSDTAmount = nextUSDTAmount;
                            botStateObj.nextCoverageTargetPrice = nextCoveragePrice;
                        }
                    } else if (botStateObj.currentPrice <= nextCoveragePrice && !hasPendingBuyLimitOrder) {
                        emitLogMessage(botStateObj.userId, `Precio de cobertura alcanzado! Intentando colocar orden de cobertura.`, 'warning');
                        console.log(`[AUTOBOT][${botStateObj.userId}] Precio de cobertura alcanzado! Intentando colocar orden de cobertura.`);
                        botStateObj.nextCoverageUSDTAmount = nextUSDTAmount;
                        botStateObj.nextCoverageTargetPrice = nextCoveragePrice;
                        await placeCoverageBuyOrder(botStateObj, bitmartCreds); // Coloca la orden de cobertura
                    } else if (hasPendingBuyLimitOrder) {
                        emitLogMessage(botStateObj.userId, `Ya hay una orden de COMPRA de COBERTURA pendiente. Esperando su ejecución.`, 'info');
                        console.log(`[AUTOBOT][${botStateObj.userId}] Ya hay una orden de COMPRA de COBERTURA pendiente. Esperando su ejecución.`);
                    } else {
                        emitLogMessage(botStateObj.userId, `Esperando precio para próxima cobertura o venta.`, 'info');
                        console.log(`[AUTOBOT][${botStateObj.userId}] Esperando precio para próxima cobertura o venta.`);
                    }
                } else {
                    emitLogMessage(botStateObj.userId, `Activo Comprado (AC) es 0 en estado BUYING. Debería haber un AC > 0 para este estado. Reajustando a RUNNING.`, 'warning');
                    console.warn(`[AUTOBOT][${botStateObj.userId}] Activo Comprado (AC) es 0 en estado BUYING. Reajustando a RUNNING.`);
                    botStateObj.state = 'RUNNING'; // Si AC es 0 en BUYING, revierte a RUNNING
                }
                break;

            case 'SELLING':
                emitLogMessage(botStateObj.userId, `Estado: **SELLING**. Gestionando ventas...`, 'warning');
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: SELLING. Gestionando ventas...`);

                // Asegura que AC sea mayor que 0 antes de proceder con la lógica de venta
                if (botStateObj.ac <= 0) {
                    emitLogMessage(botStateObj.userId, `No hay activo para vender (AC = 0) en estado SELLING. Volviendo a RUNNING.`, 'warning');
                    console.warn(`[AUTOBOT][${botStateObj.userId}] No hay activo para vender (AC = 0) en estado SELLING. Volviendo a RUNNING.`);
                    botStateObj.state = 'RUNNING';
                    resetCycleVariables(botStateObj); // Reinicia variables si no hay activo para vender
                    break;
                }

                // Verifica si ya hay una orden de venta pendiente
                const hasPendingSellOrder = botStateObj.openOrders.some(o => o.side === 'sell');
                if (hasPendingSellOrder) {
                    emitLogMessage(botStateObj.userId, `Ya hay una orden de VENTA pendiente. Esperando su ejecución.`, 'info');
                    console.log(`[AUTOBOT][${botStateObj.userId}] Ya hay una orden de VENTA pendiente. Esperando su ejecución.`);
                    break; // Sale del switch, el monitoreo de órdenes abiertas lo manejará.
                }

                // Implementa la lógica de trailing stop para PM, PV, PC
                if (botStateObj.pm === 0 || botStateObj.currentPrice > botStateObj.pm) {
                    botStateObj.pm = botStateObj.currentPrice;
                    botStateObj.pv = botStateObj.pm * (1 - SELL_STRATEGY_DECREMENT_PERCENTAGE / 100); // Usa constante
                    botStateObj.pc = botStateObj.pm * (1 - SELL_STRATEGY_PC_DECREMENT_PERCENTAGE / 100); // Usa constante
                }

                // Si el precio actual cae por debajo del Precio de Caída (PC) y hay activo, vende.
                if ((botStateObj.currentPrice <= botStateObj.pc) && botStateObj.ac > 0) {
                    emitLogMessage(botStateObj.userId, `Condiciones de venta alcanzadas! Colocando orden de venta.`, 'error');
                    console.log(`[AUTOBOT][${botStateObj.userId}] Condiciones de venta alcanzadas! Colocando orden de venta.`);
                    await placeSellOrder(botStateObj, bitmartCreds);
                } else {
                    emitLogMessage(botStateObj.userId, `Esperando condiciones para la venta. Precio actual: ${botStateObj.currentPrice.toFixed(2)}, PM: ${botStateObj.pm.toFixed(2)}, PV: ${botStateObj.pv.toFixed(2)}, PC: ${botStateObj.pc.toFixed(2)}`, 'info');
                    console.log(`[AUTOBOT][${botStateObj.userId}] Esperando condiciones para la venta. Precio actual: ${botStateObj.currentPrice.toFixed(2)}, PM: ${botStateObj.pm.toFixed(2)}, PV: ${botStateObj.pv.toFixed(2)}, PC: ${botStateObj.pc.toFixed(2)}`);
                }
                break;

            case 'NO_COVERAGE':
                emitLogMessage(botStateObj.userId, `Estado: **NO_COVERAGE**. Esperando fondos para la próxima orden de ${botStateObj.nextCoverageUSDTAmount.toFixed(2)} ${QUOTE_CURRENCY} @ ${botStateObj.nextCoverageTargetPrice.toFixed(2)}.`, 'warning');
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: NO_COVERAGE. Esperando fondos para la próxima orden de ${botStateObj.nextCoverageUSDTAmount.toFixed(2)} ${QUOTE_CURRENCY} @ ${botStateObj.nextCoverageTargetPrice.toFixed(2)}.`);
                // Si los fondos están disponibles, vuelve a BUYING para reintentar la orden de cobertura
                if (availableUSDT >= botStateObj.nextCoverageUSDTAmount && botStateObj.nextCoverageUSDTAmount >= MIN_USDT_VALUE_FOR_BITMART) {
                    emitLogMessage(botStateObj.userId, `Fondos disponibles. Volviendo a estado **BUYING** para intentar la orden de cobertura.`, 'info');
                    console.log(`[AUTOBOT][${botStateObj.userId}] Fondos disponibles. Volviendo a estado BUYING para intentar la orden de cobertura.`);
                    botStateObj.state = 'BUYING';
                }
                break;

            case 'ERROR':
                emitLogMessage(botStateObj.userId, `Estado: **ERROR**. El bot ha encontrado un error crítico. Requiere intervención manual.`, 'error');
                console.error(`[AUTOBOT][${botStateObj.userId}] Estado: ERROR. El bot ha encontrado un error crítico. Requiere intervención manual.`);
                // No se realizan más acciones en este estado, a menos que el usuario intervenga.
                break;

            case 'STOPPED':
                emitLogMessage(botStateObj.userId, `Estado: **STOPPED**. El bot está inactivo.`, 'info');
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: STOPPED. El bot está inactivo.`);
                // Si el bot está en este estado, el intervalo de ejecución debería detenerse.
                break;
            default:
                emitLogMessage(botStateObj.userId, `Estado desconocido del bot: ${botStateObj.state}. Estableciendo a **STOPPED**.`, 'warning');
                console.warn(`[AUTOBOT][${botStateObj.userId}] Estado desconocido del bot: ${botStateObj.state}. Estableciendo a STOPPED.`);
                botStateObj.state = 'STOPPED';
                botStateObj.isRunning = false; // También establece isRunning a falso
                break;
        }

    } catch (error) {
        emitLogMessage(botStateObj.userId, `❌ Falló la ejecución de la lógica del bot: ${error.message}`, 'error');
        console.error(`❌ Falló la ejecución de la lógica del bot para ${botStateObj.userId}:`, error.message);
        
        // Manejo de errores críticos como credenciales inválidas
        if (error.message.includes('Error interno del servidor al obtener y desencriptar credenciales de BitMart') || error.message.includes('API keys not configured') || error.message.includes('Invalid API key') || error.message.includes('Forbidden')) {
            emitLogMessage(botStateObj.userId, `Credenciales de BitMart inválidas o no configuradas. **Bot detenido**.`, 'error');
            console.error(`[AUTOBOT][${botStateObj.userId}] Credenciales de BitMart inválidas o no configuradas. Deteniendo el bot.`);
            
            if (botStateObj) {
                // Llama a stopBotStrategy para asegurar que el intervalo se detenga y las órdenes se cancelen
                await stopBotStrategy(botStateObj, bitmartCreds); 
            }
            // Emite un evento específico al frontend para notificar sobre el problema de credenciales
            if (ioInstance) {
                ioInstance.to(botStateObj.userId).emit('botError', { message: 'Credenciales de BitMart inválidas o no configuradas. Bot detenido.' });
            }
            return; // Sale después de manejar el error crítico
        }
        // Para otros errores no críticos, se puede cambiar el estado a 'ERROR'
        botStateObj.state = 'ERROR';
    } finally {
        await saveBotState(botStateObj); // Siempre guarda el estado al final de cada ciclo de lógica
    }
}

// Mapa para almacenar los IDs de intervalo por userId
const userBotIntervals = new Map();

/**
 * Inicia la estrategia del bot para un usuario.
 * @param {string} userId - El ID del usuario.
 * @param {Object} botParams - Parámetros iniciales para el bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function startBotStrategy(userId, botParams, bitmartCreds) {
    emitLogMessage(userId, `Iniciando estrategia para el usuario: **${userId}**`, 'info');
    console.log(`[AUTOBOT] Iniciando estrategia para el usuario: ${userId}`);
    let botState = await loadBotStateForUser(userId); // Carga el estado más reciente

    // Actualizar parámetros del bot desde el frontend
    Object.assign(botState, botParams);
    botState.isRunning = true; // Establece isRunning a true al iniciar

    // Lógica para iniciar o reanudar el ciclo
    if (botState.ac === 0) {
        resetCycleVariables(botState); // Reinicia variables para un nuevo ciclo
        botState.cycle = 1; // Inicia el ciclo en 1 si no hay activo
        botState.state = 'RUNNING'; // Establece estado inicial a RUNNING al iniciar un ciclo nuevo
    } else {
        emitLogMessage(userId, `Reanudando bot con Activo Comprado (AC) existente: ${botState.ac.toFixed(8)} ${BASE_CURRENCY}. Estado anterior: ${botState.state}`, 'warning');
        console.log(`[AUTOBOT][${userId}] Reanudando bot con AC existente: ${botState.ac.toFixed(8)} ${BASE_CURRENCY}. Estado anterior: ${botState.state}`);
        
        // Si hay AC y no está en SELLING (o un estado terminal), lo movemos a BUYING para gestionar la posición
        if (botState.state !== 'SELLING' && botState.state !== 'ERROR' && botState.state !== 'STOPPED') {
            botState.state = 'BUYING';
            emitLogMessage(userId, `Estado ajustado a **BUYING** para reanudar ciclo con AC existente.`, 'info');
            console.log(`[AUTOBOT][${userId}] Estado ajustado a BUYING para reanudar ciclo con AC existente.`);
        } else if (botState.state === 'STOPPED' || botState.state === 'ERROR') {
             // Si estaba detenido o en error, y tiene AC, se reanuda en BUYING
            botState.state = 'BUYING';
            emitLogMessage(userId, `Bot reiniciado desde **${botState.state}** con AC existente. Ajustado a **BUYING**.`, 'info');
            console.log(`[AUTOBOT][${userId}] Bot reiniciado desde ${botState.state} con AC existente. Ajustado a BUYING.`);
        }
    }

    await saveBotState(botState); // Guarda el estado inicial de RUNNING/BUYING

    // Limpiar cualquier intervalo existente para este usuario antes de crear uno nuevo
    if (userBotIntervals.has(userId)) {
        clearInterval(userBotIntervals.get(userId));
        userBotIntervals.delete(userId);
        emitLogMessage(userId, `Limpiando intervalo anterior del bot.`, 'info');
    }

    // Ejecutar la lógica del bot inmediatamente y luego en un intervalo
    await runBotLogic(botState, bitmartCreds); // Primera ejecución inmediata
    
    const intervalId = setInterval(async () => {
        // Recargar el estado del bot desde la DB en cada intervalo para asegurar que esté actualizado
        let latestBotState = await loadBotStateForUser(userId);
        // Solo continuar si el bot está explícitamente marcado como corriendo y no en un estado terminal
        if (latestBotState.isRunning && latestBotState.state !== 'STOPPED' && latestBotState.state !== 'ERROR') {
            await runBotLogic(latestBotState, bitmartCreds);
        } else {
            emitLogMessage(userId, `El bot ya no está en un estado activo (${latestBotState.state}). **Deteniendo ciclo de ejecución**.`, 'warning');
            console.log(`[AUTOBOT][${userId}] El bot ya no está en un estado activo (${latestBotState.state}). Deteniendo intervalo.`);
            clearInterval(userBotIntervals.get(userId));
            userBotIntervals.delete(userId);
            // Asegúrate de que el estado en DB se refleje como STOPPED/ERROR si no lo está ya.
            if (latestBotState.state !== 'STOPPED' && latestBotState.state !== 'ERROR') {
                latestBotState.state = 'STOPPED';
                latestBotState.isRunning = false;
                await saveBotState(latestBotState);
            }
        }
    }, BOT_INTERVAL_MS); // Ejecutar cada X segundos (definido por BOT_INTERVAL_MS)

    userBotIntervals.set(userId, intervalId);
    emitLogMessage(userId, `Estrategia iniciada para ${userId} con intervalo ID: ${intervalId}.`, 'success');
    console.log(`[AUTOBOT] Estrategia iniciada para ${userId} con intervalo ID: ${intervalId}`);
    return botState; // Devuelve el estado actualizado
}

/**
 * Detiene la estrategia del bot para un usuario.
 * @param {Object} botStateObj - El objeto del estado del bot a detener.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 */
async function stopBotStrategy(botStateObj, bitmartCreds) {
    emitLogMessage(botStateObj.userId, `Solicitud para detener la estrategia para el usuario: **${botStateObj.userId}**`, 'info');
    console.log(`[AUTOBOT] Deteniendo estrategia para el usuario: ${botStateObj.userId}`);

    // Limpiar cualquier intervalo existente
    if (userBotIntervals.has(botStateObj.userId)) {
        clearInterval(userBotIntervals.get(botStateObj.userId));
        userBotIntervals.delete(botStateObj.userId);
        emitLogMessage(botStateObj.userId, `Intervalo de estrategia limpiado.`, 'info');
        console.log(`[AUTOBOT] Intervalo de estrategia limpiado para ${botStateObj.userId}.`);
    } else {
        emitLogMessage(botStateObj.userId, `No se encontró intervalo de estrategia activo para ${botStateObj.userId}.`, 'warning');
        console.warn(`[AUTOBOT] No se encontró intervalo de estrategia activo para ${botStateObj.userId}.`);
    }

    // Cancelar órdenes abiertas al detener el bot
    await cancelOpenOrders(bitmartCreds, TRADE_SYMBOL);

    // Informar si el bot se detuvo con activos en posesión
    if (botStateObj.ac > 0) {
        emitLogMessage(botStateObj.userId, `El bot se detuvo con ${botStateObj.ac.toFixed(8)} ${BASE_CURRENCY} en posesión.`, 'warning');
        console.warn(`[AUTOBOT][${botStateObj.userId}] Bot detenido con activo en posesión.`);
    } else {
         emitLogMessage(botStateObj.userId, `El bot se detuvo sin activo en posesión.`, 'info');
         console.log(`[AUTOBOT][${botStateObj.userId}] Bot detenido sin activo en posesión.`);
    }

    botStateObj.state = 'STOPPED';
    botStateObj.isRunning = false; // Actualizar isRunning
    await saveBotState(botStateObj); // Guarda el estado actualizado
    emitLogMessage(botStateObj.userId, `Estrategia **DETENIDA** y estado actualizado.`, 'success');
    console.log(`[AUTOBOT] Estrategia detenida y estado actualizado en DB para ${botStateObj.userId}.`);
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
    emitLogMessage(userId, `Solicitud para **${action}** el bot. Estado actual: **${botState.state}**`, 'info');
    console.log(`[AUTOBOT] Solicitud para ${action} el bot para usuario ${userId}. Estado actual: ${botState.state}`);

    if (action === 'start') {
        // Verifica si el bot ya está corriendo para evitar múltiples instancias
        if (botState.isRunning && userBotIntervals.has(userId)) {
            emitLogMessage(userId, `El bot ya está corriendo para ${userId}.`, 'warning');
            console.warn(`[AUTOBOT] El bot ya está corriendo para ${userId}.`);
            return botState;
        }
        return await startBotStrategy(userId, botParams, bitmartCreds);
    } else if (action === 'stop') {
        // Verifica si el bot ya está detenido
        if (!botState.isRunning && !userBotIntervals.has(userId)) {
            emitLogMessage(userId, `El bot ya está detenido para ${userId}.`, 'warning');
            console.warn(`[AUTOBOT] El bot ya está detenido para ${userId}.`);
            return botState;
        }
        return await stopBotStrategy(botState, bitmartCreds);
    } else {
        emitLogMessage(userId, `Acción desconocida para el bot: ${action}.`, 'error');
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
};