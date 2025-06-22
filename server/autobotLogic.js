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

const MAX_FAILED_ATTEMPTS = 5; // Número máximo de intentos fallidos consecutivos antes de pasar a ESPERA

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
            if (botState.state === 'RUNNING' || botState.state === 'BUYING' || botState.state === 'SELLING' || botState.state === 'NO_COVERAGE') {
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
    
    const sizeUSDT = botStateObj.purchase; // Usar purchase del estado del bot
    console.log(`[DEBUG_ORDER] Tamaño de compra en USDT (purchaseAmount): ${sizeUSDT} USDT.`);

    // Obtener balance y precio actual para asegurar la compra
    const balanceInfo = await bitmartService.getBalance(bitmartCreds); // Pasar credenciales
    const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;

    console.log(`[DEBUG_ORDER] Balance USDT disponible: ${availableUSDT.toFixed(2)} USDT.`);
    if (availableUSDT < sizeUSDT) {
        console.warn(`[AUTOBOT][${botStateObj.userId}] Balance insuficiente para la primera orden. Necesario: ${sizeUSDT} USDT, Disponible: ${availableUSDT.toFixed(2)} USDT.`);
        botStateObj.state = 'NO_COVERAGE';
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }
    if (botStateObj.currentPrice === 0) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Precio actual no disponible para la primera orden. Reintentando...`);
        botStateObj.state = 'RUNNING'; // Sigue en RUNNING para reintentar la compra en el siguiente ciclo
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }

    let sizeBTC = sizeUSDT / botStateObj.currentPrice;
    sizeBTC = parseFloat(sizeBTC.toFixed(8)); // Redondear a 8 decimales para BTC
    console.log(`[DEBUG_ORDER] Tamaño calculado en BTC: ${sizeBTC} ${TRADE_SYMBOL.split('_')[0]}.`);

    if (sizeUSDT < MIN_USDT_VALUE_FOR_BITMART) {
        console.error(`[AUTOBOT][${botStateObj.userId}] El valor de la orden (${sizeUSDT} USDT) es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART} USDT). Ajusta tu PURCHASE.`);
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
    const sizeUSDT = botStateObj.nextCoverageUSDTAmount;
    const targetPrice = botStateObj.nextCoverageTargetPrice;

    const balanceInfo = await bitmartService.getBalance(bitmartCreds); // Pasar credenciales
    const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;

    if (availableUSDT < sizeUSDT || sizeUSDT < MIN_USDT_VALUE_FOR_BITMART) {
        console.warn(`[AUTOBOT][${botStateObj.userId}] Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto de orden (${sizeUSDT.toFixed(2)} USDT) es menor al mínimo para orden de cobertura. Cambiando a NO_COVERAGE.`);
        botStateObj.state = 'NO_COVERAGE';
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }

    if (botStateObj.currentPrice === 0) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Precio actual no disponible para orden de cobertura.`);
        return;
    }

    let sizeBTC = sizeUSDT / targetPrice;
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

                console.log(`[AUTOBOT][${botStateObj.userId}] Orden de cobertura COMPLETA. Nuevo AC: ${botStateObj.ac.toFixed(8)}, Nuevo CP: ${botStateObj.cp.toFixed(2)}, Nuevo PPC: ${botStateObj.ppc.toFixed(2)}. Ordenes en ciclo: ${botStateObj.orderCountInCycle}`);
                // botStateObj.state permanece en 'BUYING'
            } else {
                console.warn(`[AUTOBOT][${botStateObj.userId}] La orden de cobertura ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
                // Podrías dejar la orden en openOrders y esperar su llenado en el próximo ciclo
            }

        } else {
            console.error(`[AUTOBOT][${botStateObj.userId}] Error al colocar orden de cobertura: No se recibió order_id o la respuesta es inválida.`);
        }
    } catch (error) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Excepción al colocar orden de cobertura:`, error.message);
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
    let sizeBTC = botStateObj.ac; // Vender todo el activo acumulado

    if (botStateObj.ac <= 0) {
        console.warn(`[AUTOBOT][${botStateObj.userId}] No hay activo para vender (AC = 0).`);
        botStateObj.state = 'RUNNING'; // Volver a RUNNING para buscar nueva entrada
        await saveBotState(botStateObj); // Guarda el cambio de estado
        return;
    }

    try {
        console.log(`[AUTOBOT][${botStateObj.userId}] Colocando orden de VENTA (MARKET): ${sizeBTC.toFixed(8)} ${TRADE_SYMBOL.split('_')[0]} a precio de ${botStateObj.currentPrice.toFixed(2)} USDT.`);
        const orderResult = await bitmartService.placeOrder(bitmartCreds, tradeSymbol, side, orderType, sizeBTC.toString()); // Pasar credenciales
        
        console.log('[DEBUG_ORDER] Resultado de la orden de venta:', orderResult);

        if (orderResult && orderResult.order_id) {
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
                console.warn(`[AUTOBOT][${botStateObj.userId}] La orden de venta ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
            }

        } else {
            console.error(`[AUTOBOT][${botStateObj.userId}] Error al colocar la orden de venta: No se recibió order_id o la respuesta es inválida.`, orderResult);
        }
    } catch (error) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Excepción al colocar la orden de venta:`, error.message);
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
        if (ticker && ticker.last) {
            botStateObj.currentPrice = parseFloat(ticker.last);
            console.log(`[AUTOBOT][${botStateObj.userId}] Precio actual de BitMart actualizado: ${botStateObj.currentPrice.toFixed(2)} USDT`);
        } else {
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
            ioInstance.emit('balanceUpdate', { usdt: availableUSDT, btc: availableBTC });
        }

        // **LÓGICA DE VENTA PRIORITARIA (GLOBAL)**
        // Asegúrate de que botStateObj.triggerPercentage esté definido (ej. 1.5 para 1.5%)
        const expectedSellPrice = botStateObj.ppc * (1 + (botStateObj.trigger || 1.5) / 100); // Usar botStateObj.trigger para la venta
        if (botStateObj.ac > 0 && botStateObj.currentPrice >= expectedSellPrice && botStateObj.state !== 'SELLING') {
            console.log(`[AUTOBOT][${botStateObj.userId}] ¡PRECIO DE VENTA GLOBAL ALCANZADO! (${botStateObj.currentPrice.toFixed(2)} >= ${expectedSellPrice.toFixed(2)})`);
            console.log(`[AUTOBOT][${botStateObj.userId}] Transicionando a SELLING para ejecutar la estrategia de venta.`);
            botStateObj.state = 'SELLING';
        }

        switch (botStateObj.state) {
            case 'RUNNING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: RUNNING. Esperando señal de entrada de COMPRA desde el analizador de indicadores...`);

                if (botStateObj.ac > 0) {
                    console.warn(`[AUTOBOT][${botStateObj.userId}] Detectado AC > 0 en estado RUNNING. Transicionando a BUYING para reanudar ciclo.`);
                    botStateObj.state = 'BUYING';
                } else {
                    const analysisResult = await bitmartIndicatorAnalyzer.runAnalysis(botStateObj.currentPrice); // Pasar precio actual
                    console.log(`[AUTOBOT][${botStateObj.userId}] Analizador de indicadores resultado: ${analysisResult.action} - Razón: ${analysisResult.reason}`);

                    if (analysisResult.action === 'COMPRA') {
                        console.log(`[AUTOBOT][${botStateObj.userId}] ¡Señal de entrada de COMPRA DETECTADA por los indicadores!`);
                        if (availableUSDT >= botStateObj.purchase && botStateObj.purchase >= MIN_USDT_VALUE_FOR_BITMART) {
                            botStateObj.state = 'BUYING';
                            await placeFirstBuyOrder(botStateObj, bitmartCreds); // Pasar botStateObj y credenciales
                        } else {
                            console.warn(`[AUTOBOT][${botStateObj.userId}] No hay suficiente USDT para la primera orden. Necesario: ${botStateObj.purchase} USDT (mínimo ${MIN_USDT_VALUE_FOR_BITMART}), Disponible: ${availableUSDT.toFixed(2)} USDT. Cambiando a NO_COVERAGE.`);
                            botStateObj.state = 'NO_COVERAGE';
                            botStateObj.nextCoverageUSDTAmount = botStateObj.purchase;
                            botStateObj.nextCoverageTargetPrice = botStateObj.currentPrice;
                        }
                    } else {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Esperando una señal de COMPRA de los indicadores.`);
                    }
                }
                break;

            case 'BUYING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: BUYING. Gestionando compras y coberturas...`);
                console.log(`[AUTOBOT][${botStateObj.userId}] PPC: ${botStateObj.ppc.toFixed(2)}, CP: ${botStateObj.cp.toFixed(2)}, AC: ${botStateObj.ac.toFixed(8)} BTC`);
                console.log(`[AUTOBOT][${botStateObj.userId}] Último precio de orden: ${botStateObj.lastOrder ? botStateObj.lastOrder.price.toFixed(2) : 'N/A'}`);
                
                if (botStateObj.ac > 0) {
                    let nextUSDTAmount;
                    if (botStateObj.orderCountInCycle === 0 || !botStateObj.lastOrderUSDTAmount) {
                         // Fallback para asegurar que nextUSDTAmount siempre tenga un valor inicial válido.
                         nextUSDTAmount = botStateObj.purchase;
                    } else {
                        nextUSDTAmount = botStateObj.lastOrderUSDTAmount * (1 + (botStateObj.increment || 100) / 100); // Usar botStateObj.increment
                    }
                    
                    const lastOrderPrice = botStateObj.lastOrder ? botStateObj.lastOrder.price : botStateObj.ppc;
                    const nextCoveragePrice = lastOrderPrice * (1 - (botStateObj.decrement || 1) / 100); // Usar botStateObj.decrement

                    console.log(`[DEBUG_COVERAGE] Próximo monto USDT: ${nextUSDTAmount.toFixed(2)}, Precio de última orden: ${lastOrderPrice.toFixed(2)}, Precio para próxima cobertura: ${nextCoveragePrice.toFixed(2)} USDT.`);

                    if (availableUSDT < nextUSDTAmount || nextUSDTAmount < MIN_USDT_VALUE_FOR_BITMART) {
                        if (botStateObj.state !== 'NO_COVERAGE') { 
                            console.warn(`[AUTOBOT][${botStateObj.userId}] Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto (${nextUSDTAmount.toFixed(2)} USDT) es menor al mínimo para la próxima orden de cobertura. Cambiando a NO_COVERAGE.`);
                            botStateObj.state = 'NO_COVERAGE';
                            botStateObj.nextCoverageUSDTAmount = nextUSDTAmount;
                            botStateObj.nextCoverageTargetPrice = nextCoveragePrice;
                        }
                    } else if (botStateObj.currentPrice <= nextCoveragePrice) {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Precio de cobertura alcanzado! Intentando colocar orden de cobertura.`);
                        botStateObj.nextCoverageUSDTAmount = nextUSDTAmount;
                        botStateObj.nextCoverageTargetPrice = nextCoveragePrice;
                        await placeCoverageBuyOrder(botStateObj, bitmartCreds); // Pasar botStateObj y credenciales
                    } else {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Esperando precio para próxima cobertura o venta.`);
                    }
                } else if (botStateObj.ac === 0 && botStateObj.lastOrder && botStateObj.lastOrder.side === 'buy' && botStateObj.lastOrder.state !== 'filled') {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Esperando confirmación de la primera orden o actualización de AC (puede que la primera orden esté pendiente).`);
                }
                break;

            case 'SELLING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: SELLING. Gestionando ventas...`);

                // Siempre actualiza PM, PV, PC en cada iteración del estado SELLING
                if (botStateObj.pm === 0 || botStateObj.currentPrice > botStateObj.pm) {
                    botStateObj.pm = botStateObj.currentPrice;
                    // Asegúrate de que botStateObj.trailingStop esté configurado correctamente (ej. 0.5)
                    botStateObj.pv = botStateObj.pm * (1 - (botStateObj.trailingStop || 0.5) / 100); // 0.5% de caída desde PM
                    const cutLossPercentage = 0.4; // Porcentaje para la activación de venta (0.4% de caída desde PM)
                    botStateObj.pc = botStateObj.pm * (1 - cutLossPercentage / 100);
                    console.log(`[AUTOBOT][${botStateObj.userId}] Actualizando precios de venta. PM: ${botStateObj.pm.toFixed(2)}, PV (0.5%): ${botStateObj.pv.toFixed(2)}, PC (0.4%): ${botStateObj.pc.toFixed(2)}`);
                }

                // Lógica de VENTA
                if (botStateObj.orderId === null || botStateObj.orderType !== 'limit_sell') {
                    // Solo intentar colocar una nueva orden si no hay una orden de venta límite activa
                    if (botStateObj.currentPrice <= botStateObj.pc && botStateObj.ac > 0) {
                        console.log(`[AUTOBOT][${botStateObj.userId}] ✅ Condiciones de VENTA (caída del 0.4% desde PM - PC) alcanzadas! Colocando orden de VENTA LÍMITE al precio PV (${botStateObj.pv.toFixed(2)}).`);
                        // Llama a la función placeSellOrder con el precio límite
                        await placeSellOrder(botStateObj, bitmartCreds, botStateObj.pv);
                        // El estado del bot y el orderId se actualizan dentro de placeSellOrder si es exitosa.
                        // Luego, en la próxima iteración, pasaremos a la sección de monitoreo.
                    } else {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Esperando que el precio caiga al ${botStateObj.pc.toFixed(2)} (0.4% de ${botStateObj.pm.toFixed(2)}) para colocar orden LÍMITE de venta.`);
                    }
                } else if (botStateObj.orderId && botStateObj.orderType === 'limit_sell') {
                    // Si ya hay una orden de venta LÍMITE en curso, monitorearla
                    console.log(`[AUTOBOT][${botStateObj.userId}] Monitoreando orden de venta LÍMITE ID: ${botStateObj.orderId}.`);
                    try {
                        const orderDetails = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, botStateObj.orderId);

                        if (orderDetails && (orderDetails.state === 'filled' || orderDetails.state === 'fully_filled')) {
                            console.log(`[AUTOBOT][${botStateObj.userId}] ✅ Orden de VENTA LÍMITE ID ${botStateObj.orderId} COMPLETA.`);

                            let soldQty = 0;
                            let revenueAmount = 0;
                            let sellAvgPrice = 0;

                            // Lógica de extracción de filledQty y filledAmount (ya existente y robusta)
                            if (orderDetails.deal_money && orderDetails.deal_quantity) {
                                revenueAmount = parseFloat(orderDetails.deal_money);
                                soldQty = parseFloat(orderDetails.deal_quantity);
                                if (soldQty > 0) sellAvgPrice = revenueAmount / soldQty;
                            } else if (orderDetails.executed_qty && orderDetails.cummulative_quote_qty) {
                                soldQty = parseFloat(orderDetails.executed_qty);
                                revenueAmount = parseFloat(orderDetails.cummulative_quote_qty);
                                if (soldQty > 0) sellAvgPrice = revenueAmount / soldQty;
                            } else if (orderDetails.filled_notional && orderDetails.price_avg) {
                                revenueAmount = parseFloat(orderDetails.filled_notional);
                                sellAvgPrice = parseFloat(orderDetails.price_avg);
                                if (sellAvgPrice > 0) soldQty = revenueAmount / sellAvgPrice;
                            } else {
                                console.warn(`[AUTOBOT][${botStateObj.userId}] ⚠️ ADVERTENCIA: Campos no estándar en orderDetails para VENTA LÍMITE monitoreada. Intentando fallback:`, orderDetails);
                                revenueAmount = parseFloat(orderDetails.total_money || orderDetails.notional_value || '0');
                                soldQty = parseFloat(orderDetails.actual_qty || orderDetails.total_qty || '0');
                                if (soldQty > 0) sellAvgPrice = revenueAmount / soldQty;
                            }

                            if (soldQty <= 0 || revenueAmount <= 0 || sellAvgPrice <= 0) {
                                console.error(`[AUTOBOT][${botStateObj.userId}] ❌ Error: No se pudieron extraer valores válidos de la orden de venta LÍMITE monitoreada ID ${botStateObj.orderId}.`);
                                botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                                if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                                    botStateObj.state = 'ESPERA';
                                    botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al procesar detalles de orden de venta LÍMITE monitoreada.`;
                                }
                                await saveBotState(botStateObj);
                                break;
                            }

                            botStateObj.failedOrderAttempts = 0; // Resetear si la orden se procesó con éxito

                            const commissionRate = 0.001;
                            const buyCommission = botStateObj.totalInvestedUSDT * commissionRate;
                            const sellCommission = revenueAmount * commissionRate;

                            botStateObj.cycleProfit = revenueAmount - botStateObj.totalInvestedUSDT - buyCommission - sellCommission;
                            botStateObj.profit += botStateObj.cycleProfit;

                            console.log(`[AUTOBOT][${botStateObj.userId}] Ciclo ${botStateObj.cycle} completado. Ganancia/Pérdida del ciclo: ${botStateObj.cycleProfit.toFixed(2)} USDT. Ganancia total: ${botStateObj.profit.toFixed(2)} USDT.`);

                            // --- ACCIONES POST-VENTA EXITOSA ---
                            // 1. Enviar email al usuario (placeholder)
                            // if (userEmail) {
                            //     await emailService.sendEmail(userEmail,
                            //         `¡Ciclo de Autobot Completado! 🎉`,
                            //         `Tu bot ha completado el ciclo ${botStateObj.cycle} con una ganancia de ${botStateObj.cycleProfit.toFixed(2)} USDT. Tu ganancia total acumulada es de ${botStateObj.profit.toFixed(2)} USDT.`
                            //     );
                            //     console.log(`[AUTOBOT][${botStateObj.userId}] Email de ganancia de ciclo enviado a ${userEmail}.`);
                            // }

                            // 2. Lógica de detención por 'stop on cycle end'
                            if (botStateObj.stopAtCycleEnd) {
                                console.log(`[AUTOBOT][${botStateObj.userId}] Bandera "Stop on Cycle End" activada. Deteniendo el bot al final del ciclo.`);
                                await stopBotStrategy(botStateObj, bitmartCreds);
                                return;
                            }

                            // 3. Reiniciar parámetros y comenzar nuevo ciclo
                            resetCycleVariables(botStateObj);
                            botStateObj.cycle = 1;
                            botStateObj.state = 'RUNNING'; // Vuelve a RUNNING para esperar nueva señal de COMPRA
                            botStateObj.reason = '';
                            console.log(`[AUTOBOT][${botStateObj.userId}] Bot listo para el nuevo ciclo en estado RUNNING, esperando próxima señal de COMPRA.`);

                        } else if (orderDetails && orderDetails.state === 'canceled') {
                            console.warn(`[AUTOBOT][${botStateObj.userId}] ⚠️ Orden de VENTA LÍMITE ID ${botStateObj.orderId} CANCELADA (externamente o por el bot). Buscando colocar nueva orden de venta.`);
                            botStateObj.orderId = null; // Limpiar para intentar de nuevo
                            botStateObj.orderType = null;
                            botStateObj.orderPlacedTime = null;
                            botStateObj.failedOrderAttempts = 0; // Resetear, ya que la cancelación es una situación manejada.
                            await saveBotState(botStateObj);
                            // IMPORTANTE: Después de la cancelación, el bot volverá a evaluar la condición de venta (currentPrice <= pc)
                            // en la próxima iteración. Si el precio sigue por debajo de pc, intentará colocar la orden de nuevo.
                            // Si el precio ha subido por encima de pc, esperará a que se cumpla la condición.

                        } else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                            console.log(`[AUTOBOT][${botStateObj.userId}] Orden de VENTA LÍMITE ID ${botStateObj.orderId} aún ${orderDetails.state}. Esperando cumplimiento.`);
                            botStateObj.failedOrderAttempts = 0;

                            // --- NUEVA LÓGICA: REEVALUACIÓN DE ORDEN LÍMITE DE VENTA PENDIENTE ---
                            // Si la orden no se ha llenado y el precio del mercado se ha movido significativamente
                            // en contra (es decir, subió mucho por encima de nuestro PV), podría ser mejor cancelarla
                            // y esperar a que las condiciones de venta se cumplan de nuevo (quizás con un PM actualizado)
                            const timeSincePlaced = (Date.now() - botStateObj.orderPlacedTime) / 1000; // Segundos
                            const MAX_WAIT_TIME_FOR_SELL_ORDER = 120; // Espera 2 minutos para que la orden límite se llene

                            // Si el precio actual sube por encima de nuestro PV más un pequeño margen,
                            // o si la orden lleva mucho tiempo sin llenarse, cancelar y reevaluar.
                            const RE_EVALUATE_THRESHOLD_PERCENT = 0.1; // 0.1% por encima de PV
                            if (botStateObj.currentPrice > (botStateObj.pv * (1 + RE_EVALUATE_THRESHOLD_PERCENT / 100)) || timeSincePlaced > MAX_WAIT_TIME_FOR_SELL_ORDER) {
                                console.warn(`[AUTOBOT][${botStateObj.userId}] ⚠️ Orden de venta LÍMITE ID ${botStateObj.orderId} no llenada. Precio actual (${botStateObj.currentPrice.toFixed(2)}) se aleja de PV (${botStateObj.pv.toFixed(2)}) o tiempo de espera agotado. Cancelando orden para reevaluar.`);
                                await bitmartService.cancelOrder(bitmartCreds, TRADE_SYMBOL, botStateObj.orderId);
                                botStateObj.orderId = null; // Limpiar para que en la próxima iteración se intente colocar de nuevo si las condiciones se cumplen
                                botStateObj.orderType = null;
                                botStateObj.orderPlacedTime = null;
                                botStateObj.failedOrderAttempts = 0; // Se considera un manejo exitoso del escenario
                                botStateObj.reason = 'Orden de venta límite cancelada por precio alejado o timeout.';
                                await saveBotState(botStateObj);
                                // No break, permite que el loop continúe y la lógica se reevalúe.
                            }


                        } else {
                            console.error(`[AUTOBOT][${botStateObj.userId}] Estado desconocido o inesperado para orden de venta LÍMITE ID ${botStateObj.orderId}:`, orderDetails);
                            botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                            if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                                botStateObj.state = 'ESPERA';
                                botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al obtener estado de orden de venta LÍMITE ID ${botStateObj.orderId}.`;
                            }
                        }
                    } catch (orderDetailError) {
                        console.error(`[AUTOBOT][${botStateObj.userId}] Error al obtener detalles de la orden de venta LÍMITE ${botStateObj.orderId}:`, orderDetailError.message);
                        botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                        if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                            botStateObj.state = 'ESPERA';
                            botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al comunicarse con BitMart para detalles de orden de venta LÍMITE.`;
                        }
                    }
                }
                await saveBotState(botStateObj);
                break;

            case 'NO_COVERAGE':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: NO_COVERAGE. Esperando fondos para la próxima orden de ${botStateObj.nextCoverageUSDTAmount.toFixed(2)} USDT @ ${botStateObj.nextCoverageTargetPrice.toFixed(2)}.`);
                if (availableUSDT >= botStateObj.nextCoverageUSDTAmount && botStateObj.nextCoverageUSDTAmount >= MIN_USDT_VALUE_FOR_BITMART) {
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

const MAX_FAILED_ATTEMPTS = 5; // Número máximo de intentos fallidos consecutivos antes de pasar a ESPERA

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
            // CAMBIO: Inicializa new fields for error handling
            botState.failedOrderAttempts = 0;
            botState.reason = '';
            await botState.save();
            console.log(`[DB] Nuevo estado de bot por defecto guardado para ${userId}.`);
        } else {
            console.log(`[DB] Estado de bot cargado desde la base de datos para el usuario ${userId}.`);
            // CAMBIO: Asegúrate de que los nuevos campos existan al cargar
            if (typeof botState.failedOrderAttempts === 'undefined') botState.failedOrderAttempts = 0;
            if (typeof botState.reason === 'undefined') botState.reason = '';
            // Si el bot estaba en un estado activo pero no tiene un intervalId (ej. reinicio de servidor)
            if (botState.strategyIntervalId) {
                clearInterval(botState.strategyIntervalId);
                botState.strategyIntervalId = null;
            }
             // Si el bot estaba en RUNNING, BUYING, SELLING, NO_COVERAGE y el servidor se reinició,
             // pasarlo a STOPPED para que el usuario lo inicie manualmente.
            if (['RUNNING', 'BUYING', 'SELLING', 'NO_COVERAGE'].includes(botState.state)) {
                console.warn(`[DB] Bot de ${userId} estaba en estado ${botState.state}. Se ha reiniciado en STOPPED. Por favor, inícielo manualmente.`);
                botState.state = 'STOPPED';
                botState.isRunning = false;
                await botState.save(); // Guarda el cambio de estado
            }
        }
        
        // Si el bot se carga con activo comprado (ac > 0), pero está en estado 'RUNNING' o 'STOPPED',
        // se asume que un ciclo quedó a medias y el servidor se reinició.
        // Se sugiere al usuario que al iniciar el bot, el sistema lo moverá a BUYING para continuar la gestión.
        if (botState.ac > 0 && (botState.state === 'RUNNING' || botState.state === 'STOPPED')) {
            console.warn(`[DB] Bot de ${userId} cargado en estado ${botState.state} con AC > 0. Al iniciar, transicionará a BUYING para reanudar ciclo.`);
        }

        return botState;
    } catch (error) {
        console.error(`❌ Error cargando estado del bot para el usuario ${userId} desde DB:`, error.message);
        // Si hay un error, devuelve un estado por defecto para evitar que la aplicación falle.
        const defaultBotState = new BotState({ userId });
        defaultBotState.failedOrderAttempts = 0;
        defaultBotState.reason = `Error al cargar estado desde DB: ${error.message}`;
        defaultBotState.state = 'ESPERA'; // CAMBIO: Si no se puede cargar, pasa a ESPERA.
        return defaultBotState;
    }
}

/**
 * Guarda el estado del bot en la base de datos.
 * @param {Object} botStateObj - El objeto del estado del bot a guardar.
 */
async function saveBotState(botStateObj) {
    try {
        const stateToSave = { ...botStateObj };
        // No guardar propiedades temporales o de instancia en la DB
        delete stateToSave.strategyIntervalId;
        
        await BotState.findOneAndUpdate(
            { userId: botStateObj.userId },
            stateToSave,
            { upsert: true, new: true }
        );
        console.log(`[DB] Estado del bot guardado para el usuario ${botStateObj.userId}.`);
    } catch (error) {
        console.error(`❌ Error guardando estado del bot para ${botStateObj.userId} en DB:`, error.message);
    }
}

// --- Funciones para resetear las variables del ciclo ---
/**
 * Resetea las variables de un ciclo para un objeto de estado del bot dado.
 * Esto se llama al final de un ciclo de venta exitoso, o al iniciar un nuevo bot con AC=0.
 * @param {Object} botStateObj - El objeto del estado del bot a resetear.
 */
function resetCycleVariables(botStateObj) {
    console.log(`[AUTOBOT] Reseteando variables del ciclo para usuario ${botStateObj.userId}.`);
    // CAMBIO: Nombres de variables unificados y simplificados
    botStateObj.avgPrice = 0; // Promedio ponderado de compra (anteriormente ppc)
    botStateObj.totalInvestedUSDT = 0; // Costo promedio en USDT (anteriormente cp)
    botStateObj.ac = 0; // Activo acumulado en BTC
    botStateObj.pm = 0; // Precio máximo (para trailing stop)
    botStateObj.pv = 0; // Precio de venta (para trailing stop)
    botStateObj.pc = 0; // Precio de compra (para trailing stop)
    botStateObj.lastOrder = null; // Última orden colocada/completada
    botStateObj.orderId = null; // El ID de la orden activa actual
    botStateObj.orderType = null; // Tipo de la orden activa ('market' o 'limit')
    botStateObj.orderPlacedTime = null; // Timestamp de cuando se colocó la orden activa
    botStateObj.openOrders = []; // Lista de órdenes abiertas (si la API lo devuelve) - Aunque solo se monitoreará una activa
    botStateObj.cycleProfit = 0;
    botStateObj.cycle = 0; // El ciclo comienza en 0 antes de la primera compra, luego 1
    // botStateObj.lastOrderUSDTAmount; // Ya no es necesaria, se calcula dinámicamente
    // botStateObj.nextCoverageUSDTAmount; // Ya no es necesaria, se calcula dinámicamente
    // botStateObj.nextCoverageTargetPrice; // Ya no es necesaria, se calcula dinámicamente
    // Reiniciar contadores de error al inicio de un nuevo ciclo exitoso
    botStateObj.failedOrderAttempts = 0;
    botStateObj.reason = '';
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
        return true; // Éxito en cancelación
    } catch (error) {
        console.error('[AUTOBOT] Error al cancelar órdenes abiertas:', error.message);
        return false; // Fallo en cancelación
    }
}

// CAMBIO: Se eliminan las funciones placeFirstBuyOrder y placeCoverageBuyOrder
// Su lógica se integra directamente en el case 'BUYING' de runBotLogic

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
    let sizeBTC = botStateObj.ac; // Vender todo el activo acumulado

    if (botStateObj.ac <= 0) {
        console.warn(`[AUTOBOT][${botStateObj.userId}] No hay activo para vender (AC = 0).`);
        botStateObj.state = 'RUNNING'; // Volver a RUNNING para buscar nueva entrada
        await saveBotState(botStateObj);
        return;
    }

    try {
        console.log(`[AUTOBOT][${botStateObj.userId}] Colocando orden de VENTA (MARKET): ${sizeBTC.toFixed(8)} ${TRADE_SYMBOL.split('_')[0]} a precio de ${botStateObj.currentPrice.toFixed(2)} USDT.`);
        const orderResult = await bitmartService.placeOrder(bitmartCreds, tradeSymbol, side, orderType, sizeBTC.toString());
        
        console.log('[DEBUG_ORDER] Resultado de la orden de venta:', orderResult);

        if (orderResult && orderResult.order_id) {
            console.log(`[AUTOBOT][${botStateObj.userId}] Orden de VENTA colocada con éxito. ID de orden: ${orderResult.order_id}`);

            // CAMBIO: Asegurarse de que el orderId y orderType estén actualizados para monitoreo
            botStateObj.orderId = orderResult.order_id;
            botStateObj.orderType = 'market_sell'; // Nuevo tipo para diferenciar
            botStateObj.orderPlacedTime = Date.now();
            botStateObj.failedOrderAttempts = 0; // Resetear intentos al colocar orden

            // Monitorear el estado de la orden de venta
            await new Promise(resolve => setTimeout(resolve, 3000)); // Espera un poco para que se procese
            const filledOrder = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, orderResult.order_id);
            
            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                // CAMBIO: Extracción robusta de filledQty y filledAmount para ventas
                let soldQty = 0; // Cantidad de BTC vendida
                let revenueAmount = 0; // Cantidad de USDT recibida
                let sellAvgPrice = 0; // Precio promedio de ejecución de esta orden

                if (filledOrder.deal_money && filledOrder.deal_quantity) {
                    revenueAmount = parseFloat(filledOrder.deal_money); // USDT recibido
                    soldQty = parseFloat(filledOrder.deal_quantity); // BTC vendido
                    sellAvgPrice = revenueAmount / soldQty;
                } else if (filledOrder.executed_qty && filledOrder.cummulative_quote_qty) {
                    soldQty = parseFloat(filledOrder.executed_qty);
                    revenueAmount = parseFloat(filledOrder.cummulative_quote_qty);
                    sellAvgPrice = revenueAmount / soldQty;
                } else if (filledOrder.filled_notional && filledOrder.price_avg) {
                    revenueAmount = parseFloat(filledOrder.filled_notional); // Asumiendo USDT recibido
                    sellAvgPrice = parseFloat(filledOrder.price_avg);
                    soldQty = revenueAmount / sellAvgPrice;
                } else {
                    console.error(`[AUTOBOT][${botStateObj.userId}] ❌ ADVERTENCIA: Campos de cantidad y monto no estándar en orderDetails para VENTA. Intentando fallback:`, filledOrder);
                    revenueAmount = parseFloat(filledOrder.total_money || filledOrder.notional_value || '0');
                    soldQty = parseFloat(filledOrder.actual_qty || filledOrder.total_qty || '0');
                    if (soldQty > 0) sellAvgPrice = revenueAmount / soldQty;
                }

                if (soldQty === 0 || revenueAmount === 0 || sellAvgPrice === 0) {
                    console.error(`[AUTOBOT][${botStateObj.userId}] ❌ Error: No se pudieron extraer valores válidos (qty/amount/price) de la orden de venta completada ID ${botStateObj.orderId}.`);
                    botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                    if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                        botStateObj.state = 'ESPERA';
                        botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al procesar detalles de orden de venta (valores inválidos).`;
                    }
                    await saveBotState(botStateObj);
                    return; // Salir si no se puede procesar la venta
                }

                // Las comisiones deben ser calculadas con los valores reales.
                // Asumiendo una comisión del 0.1% por lado (compra y venta).
                const commissionRate = 0.001; 
                const buyCommission = botStateObj.totalInvestedUSDT * commissionRate;
                const sellCommission = revenueAmount * commissionRate;

                botStateObj.cycleProfit = revenueAmount - botStateObj.totalInvestedUSDT - buyCommission - sellCommission;
                botStateObj.profit += botStateObj.cycleProfit;

                console.log(`[AUTOBOT][${botStateObj.userId}] Ciclo ${botStateObj.cycle} completado. Ganancia/Pérdida del ciclo: ${botStateObj.cycleProfit.toFixed(2)} USDT. Ganancia total: ${botStateObj.profit.toFixed(2)} USDT.`);

                // LÓGICA DE DETENCIÓN POR 'STOP ON CYCLE END'
                if (botStateObj.stopAtCycleEnd) {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Bandera "Stop on Cycle End" activada. Deteniendo el bot al final del ciclo.`);
                    await stopBotStrategy(botStateObj, bitmartCreds);
                    return; // Salir después de detener el bot
                }

                resetCycleVariables(botStateObj); // Resetear variables para el nuevo ciclo
                botStateObj.cycle = 1; // CAMBIO: El nuevo ciclo comienza en 1.
                botStateObj.state = 'RUNNING'; // Volver a RUNNING para que espere la nueva señal de COMPRA
                console.log(`[AUTOBOT][${botStateObj.userId}] Bot listo para el nuevo ciclo en estado RUNNING, esperando próxima señal de COMPRA.`);

            } else {
                console.warn(`[AUTOBOT][${botStateObj.userId}] La orden de venta ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
                // CAMBIO: Manejo de orden de venta no completada
                botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                    botStateObj.state = 'ESPERA';
                    botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al completar orden de venta ID ${botStateObj.orderId}.`;
                }
            }

        } else {
            console.error(`[AUTOBOT][${botStateObj.userId}] Error al colocar la orden de venta: No se recibió order_id o la respuesta es inválida.`, orderResult);
            // CAMBIO: Manejo de errores al colocar orden de venta
            botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
            if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                botStateObj.state = 'ESPERA';
                botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al colocar orden de venta (sin order_id).`;
            }
        }
    } catch (error) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Excepción al colocar la orden de venta:`, error.message);
        // CAMBIO: Manejo de excepciones al colocar orden de venta
        botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
        if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
            botStateObj.state = 'ESPERA';
            botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al intentar colocar orden de venta.`;
        }
    }
    await saveBotState(botStateObj); // Guardar el estado después de intentar la venta
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
        if (ticker && ticker.last) {
            botStateObj.currentPrice = parseFloat(ticker.last);
            console.log(`[AUTOBOT][${botStateObj.userId}] Precio actual de BitMart actualizado: ${botStateObj.currentPrice.toFixed(2)} USDT`);
            // CAMBIO: Reiniciar el contador de fallos si la obtención del ticker fue exitosa.
            botStateObj.failedOrderAttempts = 0; 
        } else {
            console.warn(`[AUTOBOT][${botStateObj.userId}] No se pudo obtener el precio actual. Reintentando...`);
            // CAMBIO: Manejo de error al obtener ticker
            botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
            if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                console.error(`[AUTOBOT][${botStateObj.userId}] ❌ Demasiados fallos consecutivos al obtener ticker. Pasando a ESPERA.`);
                botStateObj.state = 'ESPERA';
                botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al obtener el precio del ticker.`;
            }
            await saveBotState(botStateObj);
            return; // Salir si no podemos obtener el precio actual
        }

        // Obtener balance actualizado al inicio de cada ciclo para NO_COVERAGE y otras validaciones
        const balanceInfo = await bitmartService.getBalance(bitmartCreds);
        const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
        const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;
        const btcBalance = balanceInfo.find(b => b.currency === 'BTC');
        const availableBTC = btcBalance ? parseFloat(btcBalance.available) : 0;

        // Emit balance update
        if (ioInstance) {
            ioInstance.emit('balanceUpdate', { userId: botStateObj.userId, usdt: availableUSDT, btc: availableBTC });
        }

        // **LÓGICA DE VENTA PRIORITARIA (GLOBAL) - TRIGGER DE VENTA**
        // Asegúrate de que botStateObj.triggerPercentage esté definido (ej. 1.5 para 1.5%)
        // triggerPrice se recalcula después de cada compra o al inicio de un nuevo ciclo si avgPrice > 0
        if (botStateObj.ac > 0 && botStateObj.currentPrice > 0 && botStateObj.triggerPrice > 0) {
            if (botStateObj.currentPrice >= botStateObj.triggerPrice && botStateObj.state !== 'SELLING') {
                console.log(`[AUTOBOT][${botStateObj.userId}] ✅ Precio de VENTA (TRIGGER) alcanzado: ${botStateObj.currentPrice.toFixed(2)} >= ${botStateObj.triggerPrice.toFixed(2)}.`);
                console.log(`[AUTOBOT][${botStateObj.userId}] Transicionando a SELLING para ejecutar la estrategia de venta.`);
                botStateObj.state = 'SELLING';
                botStateObj.reason = `Trigger de venta (${botStateObj.triggerPrice.toFixed(2)}) alcanzado por el precio (${botStateObj.currentPrice.toFixed(2)}).`;
                await saveBotState(botStateObj);
                // No break aquí, permite que la lógica SELLING se procese en la misma iteración
                // si no hay una orden de compra pendiente que deba ser monitoreada.
                // Sin embargo, si SELLING es un estado terminal que ya coloca la orden y resetea,
                // entonces un `break` aquí sería apropiado. Por ahora lo dejamos para que se procese abajo.
            }
        }
        
        switch (botStateObj.state) {
            case 'RUNNING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: RUNNING. Esperando señal de entrada de COMPRA desde el analizador de indicadores...`);

                // CAMBIO: Si ya hay activo (AC > 0) y el bot está en RUNNING, pasa directamente a BUYING.
                // Esto maneja casos donde un ciclo fue interrumpido o el bot se reanudó.
                if (botStateObj.ac > 0) {
                    console.warn(`[AUTOBOT][${botStateObj.userId}] Detectado AC > 0 en estado RUNNING. Transicionando a BUYING para reanudar ciclo de gestión de posición.`);
                    botStateObj.state = 'BUYING';
                    // No break, deja que la lógica de BUYING se procese en la misma iteración
                } else {
                    const analysisResult = await bitmartIndicatorAnalyzer.runAnalysis(botStateObj.currentPrice);
                    console.log(`[AUTOBOT][${botStateObj.userId}] Analizador de indicadores resultado: ${analysisResult.action} - Razón: ${analysisResult.reason}`);

                    if (analysisResult.action === 'COMPRA') {
                        console.log(`[AUTOBOT][${botStateObj.userId}] ¡Señal de entrada de COMPRA DETECTADA por los indicadores!`);
                        if (availableUSDT >= botStateObj.purchase && botStateObj.purchase >= MIN_USDT_VALUE_FOR_BITMART) {
                            botStateObj.state = 'BUYING';
                            botStateObj.cycle = 1; // Inicia el ciclo en 1 para la primera compra
                            // CAMBIO: La primera orden se gestionará dentro del case 'BUYING' ahora.
                            // No se llama a placeFirstBuyOrder directamente aquí.
                        } else {
                            console.warn(`[AUTOBOT][${botStateObj.userId}] No hay suficiente USDT para la primera orden. Necesario: ${botStateObj.purchase} USDT (mínimo ${MIN_USDT_VALUE_FOR_BITMART}), Disponible: ${availableUSDT.toFixed(2)} USDT. Cambiando a NO_COVERAGE.`);
                            botStateObj.state = 'NO_COVERAGE';
                            // No es necesario nextCoverageUSDTAmount/TargetPrice aquí, ya que se calcula en BUYING/NO_COVERAGE
                            botStateObj.reason = `Fondos insuficientes para la primera orden de ${botStateObj.purchase.toFixed(2)} USDT.`;
                        }
                    } else {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Esperando una señal de COMPRA de los indicadores.`);
                    }
                }
                break;

            case 'BUYING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: BUYING. Gestionando compras y coberturas...`);
                console.log(`[AUTOBOT][${botStateObj.userId}] AC: ${botStateObj.ac.toFixed(8)} BTC, AvgPrice: ${botStateObj.avgPrice.toFixed(2)}, TotalInvertido: ${botStateObj.totalInvestedUSDT.toFixed(2)} USDT`);
                console.log(`[AUTOBOT][${botStateObj.userId}] Última orden ID: ${botStateObj.orderId || 'N/A'}`);

                // Si no hay una orden en curso, colocar la próxima orden de compra
                if (botStateObj.orderId === null) { 
                    let amountToBuyUSDT = 0;
                    let purchaseType = '';
                    let limitPrice = 0;

                    if (botStateObj.ac === 0) { // Primera compra del ciclo (usando PURCHASE)
                        amountToBuyUSDT = botStateObj.purchase; // Usar botStateObj.purchase (parámetro de usuario)
                        purchaseType = 'Primera Orden (Mercado)';
                        // Para orden de mercado, el precio límite es el actual para estimar la cantidad de BTC
                        limitPrice = botStateObj.currentPrice; 
                        console.log(`[AUTOBOT][${botStateObj.userId}] Preparando primera orden de compra (Ciclo ${botStateObj.cycle}). Cantidad a gastar: ${amountToBuyUSDT.toFixed(2)} USDT.`);
                    } else { // Órdenes subsiguientes (Límite)
                        // CAMBIO: Calcular el precio límite basado en el promedio ponderado y DECREMENT.
                        // Ya no se espera que el precio actual baje a este punto para colocar la orden.
                        limitPrice = botStateObj.avgPrice * (1 - (botStateObj.decrement / 100));
                        // CAMBIO: El monto de la orden se escala con cada ciclo.
                        // `botStateObj.cycle` ya se incrementó después de la última compra exitosa.
                        amountToBuyUSDT = botStateObj.purchase * botStateObj.cycle; 
                        purchaseType = `Orden ${botStateObj.cycle} (Límite)`;
                        console.log(`[AUTOBOT][${botStateObj.userId}] Preparando orden de compra ${botStateObj.cycle}. Precio Límite: ${limitPrice.toFixed(2)}. Cantidad a gastar: ${amountToBuyUSDT.toFixed(2)} USDT.`);
                    }

                    // Asegurarse de que el monto a comprar y el precio límite sean válidos
                    if (amountToBuyUSDT < MIN_USDT_VALUE_FOR_BITMART || limitPrice <= 0) {
                        console.error(`[AUTOBOT][${botStateObj.userId}] Error: Monto a comprar (${amountToBuyUSDT.toFixed(2)} USDT) menor al mínimo o precio límite (${limitPrice.toFixed(2)}) inválido. Ajusta tus parámetros.`);
                        botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                        if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                            botStateObj.state = 'ESPERA';
                            botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) con parámetros de orden inválidos (monto/precio).`;
                        }
                        await saveBotState(botStateObj);
                        break; // Salir del case BUYING
                    }

                    // Validar balance antes de colocar orden
                    if (availableUSDT < amountToBuyUSDT) {
                        console.warn(`[AUTOBOT][${botStateObj.userId}] ⚠️ Balance USDT insuficiente para la compra. Necesario: ${amountToBuyUSDT.toFixed(2)}, Disponible: ${availableUSDT.toFixed(2)}.`);
                        botStateObj.state = 'NO_COVERAGE';
                        botStateObj.reason = `Balance USDT insuficiente para la compra. Necesario: ${amountToBuyUSDT.toFixed(2)}, Disponible: ${availableUSDT.toFixed(2)}.`;
                        await saveBotState(botStateObj);
                        break; // Salir del case BUYING
                    }

                    // Colocar la orden de compra
                    try {
                        let orderResult;
                        let quantityBTC = 0; // Cantidad de BTC a comprar

                        if (botStateObj.ac === 0) { // Primera orden: Precio de mercado (se define por USDT a gastar)
                            orderResult = await bitmartService.placeMarketOrder(TRADE_SYMBOL, 'buy', amountToBuyUSDT.toFixed(2), bitmartCreds);
                            console.log(`[AUTOBOT][${botStateObj.userId}] Orden de mercado colocada: ${JSON.stringify(orderResult)}`);
                        } else { // Órdenes subsiguientes: Precio límite (se define por cantidad de BTC a comprar)
                            // La cantidad de BTC se calcula en base al USDT a gastar y el precio límite
                            quantityBTC = amountToBuyUSDT / limitPrice; 
                            orderResult = await bitmartService.placeLimitOrder(TRADE_SYMBOL, 'buy', quantityBTC.toFixed(8), limitPrice.toFixed(2), bitmartCreds);
                            console.log(`[AUTOBOT][${botStateObj.userId}] Orden límite colocada: ${JSON.stringify(orderResult)}`);
                        }

                        if (orderResult && orderResult.order_id) {
                            botStateObj.orderId = orderResult.order_id;
                            botStateObj.orderType = botStateObj.ac === 0 ? 'market_buy' : 'limit_buy';
                            botStateObj.orderPlacedTime = Date.now();
                            botStateObj.failedOrderAttempts = 0; // Reiniciar contador de fallos si la orden se colocó con éxito
                            console.log(`[AUTOBOT][${botStateObj.userId}] Orden ${purchaseType} colocada con ID: ${botStateObj.orderId}`);
                        } else {
                            console.error(`[AUTOBOT][${botStateObj.userId}] Error al colocar la orden de ${purchaseType}. Sin order_id. Resultado: ${JSON.stringify(orderResult)}`);
                            botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                            if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                                botStateObj.state = 'ESPERA';
                                botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al colocar órdenes de compra (sin order_id).`;
                            }
                        }
                    } catch (orderError) {
                        console.error(`[AUTOBOT][${botStateObj.userId}] Error al intentar colocar orden de ${purchaseType}:`, orderError.message);
                        botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                        if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                            botStateObj.state = 'ESPERA';
                            botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al comunicarse con BitMart para colocar orden de compra.`;
                        }
                    }
                } else { // Si ya hay una orden en curso (orderId !== null), monitorear su estado
                    console.log(`[AUTOBOT][${botStateObj.userId}] Monitoreando orden de compra ID: ${botStateObj.orderId}`);
                    try {
                        const orderDetails = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, botStateObj.orderId);

                        if (orderDetails && (orderDetails.state === 'filled' || orderDetails.state === 'fully_filled')) {
                            console.log(`[AUTOBOT][${botStateObj.userId}] ✅ Orden de compra ID ${botStateObj.orderId} COMPLETA.`);
                            
                            // CAMBIO: Implementación de la validación de filledQty y filledAmount
                            let filledQty = 0; // Cantidad de BTC comprada
                            let filledAmount = 0; // Cantidad de USDT gastada
                            let filledAvgPrice = 0; // Precio promedio de ejecución de esta orden

                            // Prioridad 1: BitMart V3 `deal_money` (USDT) y `deal_quantity` (BTC)
                            if (orderDetails.deal_money && orderDetails.deal_quantity) {
                                filledAmount = parseFloat(orderDetails.deal_money);
                                filledQty = parseFloat(orderDetails.deal_quantity);
                                if (filledQty > 0) filledAvgPrice = filledAmount / filledQty;
                            } 
                            // Prioridad 2: `executed_qty` y `cummulative_quote_qty` (comunes en otras APIs)
                            else if (orderDetails.executed_qty && orderDetails.cummulative_quote_qty) {
                                filledQty = parseFloat(orderDetails.executed_qty);
                                filledAmount = parseFloat(orderDetails.cummulative_quote_qty);
                                if (filledQty > 0) filledAvgPrice = filledAmount / filledQty;
                            } 
                            // Prioridad 3: `filled_notional` y `price_avg` (si V3 usa estos)
                            else if (orderDetails.filled_notional && orderDetails.price_avg) {
                                filledAmount = parseFloat(orderDetails.filled_notional);
                                filledAvgPrice = parseFloat(orderDetails.price_avg);
                                if (filledAvgPrice > 0) filledQty = filledAmount / filledAvgPrice;
                            } 
                            // Fallback con logging de advertencia
                            else {
                                console.warn(`[AUTOBOT][${botStateObj.userId}] ⚠️ ADVERTENCIA: Campos de cantidad y monto no estándar en orderDetails. Intentando fallback:`, orderDetails);
                                filledAmount = parseFloat(orderDetails.total_money || orderDetails.notional_value || '0');
                                filledQty = parseFloat(orderDetails.actual_qty || orderDetails.total_qty || '0');
                                if (filledQty > 0) filledAvgPrice = filledAmount / filledQty;
                            }

                            if (filledQty <= 0 || filledAmount <= 0 || filledAvgPrice <= 0) {
                                console.error(`[AUTOBOT][${botStateObj.userId}] ❌ Error: No se pudieron extraer valores válidos (qty/amount/price) de la orden completada ID ${botStateObj.orderId}. Detalles:`, orderDetails);
                                botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                                if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                                    botStateObj.state = 'ESPERA';
                                    botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al procesar detalles de órdenes completadas (valores inválidos).`;
                                }
                                await saveBotState(botStateObj);
                                break;
                            }

                            // Reiniciar contador de fallos si la orden se procesó con éxito
                            botStateObj.failedOrderAttempts = 0; 

                            // Actualizar variables de posición (promedio ponderado)
                            if (botStateObj.ac === 0) { // Si es la primera compra, el promedio es el precio de esta orden
                                botStateObj.avgPrice = filledAvgPrice;
                            } else {
                                // Fórmula de promedio ponderado: (precio_viejo * cantidad_vieja + precio_nuevo * cantidad_nueva) / (cantidad_vieja + cantidad_nueva)
                                botStateObj.avgPrice = ((botStateObj.avgPrice * botStateObj.ac) + (filledAvgPrice * filledQty)) / (botStateObj.ac + filledQty);
                            }

                            botStateObj.ac += filledQty; // Acumular cantidad comprada en BTC
                            botStateObj.totalInvestedUSDT += filledAmount; // Acumular inversión total en USDT
                            botStateObj.cycle++; // Avanzar al siguiente ciclo/orden
                            botStateObj.orderId = null; // Reiniciar orderId para la próxima orden
                            botStateObj.orderType = null;
                            botStateObj.orderPlacedTime = null;

                            // Calcular el nuevo triggerPrice después de cada compra
                            if (botStateObj.avgPrice > 0 && botStateObj.trigger > 0) { // Usar botStateObj.trigger para el porcentaje
                                botStateObj.triggerPrice = botStateObj.avgPrice * (1 + (botStateObj.trigger / 100));
                                console.log(`[AUTOBOT][${botStateObj.userId}] Nuevo precio promedio: ${botStateObj.avgPrice.toFixed(2)}, Nuevo Trigger Price: ${botStateObj.triggerPrice.toFixed(2)}`);
                            } else {
                                console.warn(`[AUTOBOT][${botStateObj.userId}] No se pudo calcular el triggerPrice. avgPrice: ${botStateObj.avgPrice}, Trigger Porcentaje: ${botStateObj.trigger}.`);
                                botStateObj.triggerPrice = 0; // Asegurarse de que no quede un valor inválido
                            }

                            await saveBotState(botStateObj); // Guardar el estado actualizado
                            console.log(`[AUTOBOT][${botStateObj.userId}] Estado actualizado después de compra. AC: ${botStateObj.ac.toFixed(8)}, AvgPrice: ${botStateObj.avgPrice.toFixed(2)}, Ciclo: ${botStateObj.cycle}`);

                            // Después de completar una orden, la próxima ejecución del setInterval
                            // intentará colocar la siguiente orden (si orderId es null y el bot está en BUYING)
                            // o pasará a SELLING si el triggerPrice fue alcanzado (verificado al inicio).

                        } else if (orderDetails && orderDetails.state === 'canceled') {
                            console.warn(`[AUTOBOT][${botStateObj.userId}] ⚠️ Orden de compra ID ${botStateObj.orderId} CANCELADA. Se intentará colocar una nueva orden en la próxima iteración.`);
                            botStateObj.orderId = null; // Limpiar para intentar de nuevo
                            botStateObj.orderType = null;
                            botStateObj.orderPlacedTime = null;
                            botStateObj.failedOrderAttempts = 0; // Resetear, ya que la cancelación es una situación manejada.
                            await saveBotState(botStateObj);
                        } else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                            console.log(`[AUTOBOT][${botStateObj.userId}] Orden ID ${botStateObj.orderId} aún ${orderDetails.state}. Esperando cumplimiento.`);
                            botStateObj.failedOrderAttempts = 0; // Reiniciar si la orden sigue activa y válida.
                        } else {
                            console.error(`[AUTOBOT][${botStateObj.userId}] Estado desconocido o inesperado para orden ID ${botStateObj.orderId}:`, orderDetails);
                            botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                            if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                                botStateObj.state = 'ESPERA';
                                botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al obtener estado de orden de compra ID ${botStateObj.orderId}.`;
                            }
                        }
                    } catch (orderDetailError) {
                        console.error(`[AUTOBOT][${botStateObj.userId}] Error al obtener detalles de la orden ${botStateObj.orderId}:`, orderDetailError.message);
                        botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                        if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                            botStateObj.state = 'ESPERA';
                            botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al comunicarse con BitMart para detalles de orden de compra.`;
                        }
                    }
                }
                await saveBotState(botStateObj); // Siempre guardar el estado al final de cada ciclo de lógica
                break;

            case 'SELLING':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: SELLING. Gestionando ventas...`);
                // Asegúrate de que no haya una orden de venta pendiente antes de intentar colocar una nueva
                if (botStateObj.orderId === null || botStateObj.orderType !== 'market_sell') {
                    // Si el precio actual es mayor que el precio máximo registrado (pm), actualiza pm
                    if (botStateObj.pm === 0 || botStateObj.currentPrice > botStateObj.pm) {
                        botStateObj.pm = botStateObj.currentPrice;
                        // Calcular el precio de venta (pv) con un porcentaje de trailing stop (ej. 0.5%)
                        botStateObj.pv = botStateObj.pm * (1 - (botStateObj.trailingStop || 0.5) / 100); 
                        // Calcular el precio de corte (pc) con un porcentaje adicional de caída (ej. 0.4%)
                        // CAMBIO: Usar un parámetro configurable para PC, o un valor fijo.
                        // Usaremos un valor fijo por ahora para mantener la simplicidad si no hay un parámetro `cutLossPercentage`
                        const cutLossPercentage = 0.4; // Porcentaje de caída adicional desde PM para activar venta
                        botStateObj.pc = botStateObj.pm * (1 - cutLossPercentage / 100); 
                        console.log(`[AUTOBOT][${botStateObj.userId}] Actualizando precios de venta. PM: ${botStateObj.pm.toFixed(2)}, PV: ${botStateObj.pv.toFixed(2)}, PC: ${botStateObj.pc.toFixed(2)}`);
                    }

                    // Condición para colocar la orden de venta
                    if (botStateObj.currentPrice <= botStateObj.pc && botStateObj.ac > 0) {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Condiciones de venta (PC) alcanzadas! Colocando orden de venta.`);
                        await placeSellOrder(botStateObj, bitmartCreds);
                        // Después de placeSellOrder, el bot puede ir a RUNNING o STOPPED si stopAtCycleEnd es true.
                        // No es necesario un break aquí ya que placeSellOrder maneja la transición de estado.
                    } else if (botStateObj.currentPrice <= botStateObj.pv && botStateObj.ac > 0 && botStateObj.currentPrice < botStateObj.pm) {
                         console.log(`[AUTOBOT][${botStateObj.userId}] Precio de venta (PV) alcanzado! Colocando orden de venta.`);
                         await placeSellOrder(botStateObj, bitmartCreds);
                    } else {
                        console.log(`[AUTOBOT][${botStateObj.userId}] Esperando condiciones para la venta. Precio actual: ${botStateObj.currentPrice.toFixed(2)}, PM: ${botStateObj.pm.toFixed(2)}, PV: ${botStateObj.pv.toFixed(2)}, PC: ${botStateObj.pc.toFixed(2)}`);
                    }
                } else {
                    // Si hay una orden de venta en curso, monitorearla (similar a la lógica de compra)
                    console.log(`[AUTOBOT][${botStateObj.userId}] Monitoreando orden de venta ID: ${botStateObj.orderId}`);
                    try {
                        const orderDetails = await bitmartService.getOrderDetail(bitmartCreds, TRADE_SYMBOL, botStateObj.orderId);

                        if (orderDetails && (orderDetails.state === 'filled' || orderDetails.state === 'fully_filled')) {
                            console.log(`[AUTOBOT][${botStateObj.userId}] ✅ Orden de VENTA ID ${botStateObj.orderId} COMPLETA.`);
                            // CAMBIO: Reutilizar lógica de extracción de venta
                            let soldQty = 0; 
                            let revenueAmount = 0; 
                            let sellAvgPrice = 0; 

                            if (orderDetails.deal_money && orderDetails.deal_quantity) {
                                revenueAmount = parseFloat(orderDetails.deal_money); 
                                soldQty = parseFloat(orderDetails.deal_quantity); 
                                if (soldQty > 0) sellAvgPrice = revenueAmount / soldQty;
                            } else if (orderDetails.executed_qty && orderDetails.cummulative_quote_qty) {
                                soldQty = parseFloat(orderDetails.executed_qty);
                                revenueAmount = parseFloat(orderDetails.cummulative_quote_qty);
                                if (soldQty > 0) sellAvgPrice = revenueAmount / soldQty;
                            } else if (orderDetails.filled_notional && orderDetails.price_avg) {
                                revenueAmount = parseFloat(orderDetails.filled_notional);
                                sellAvgPrice = parseFloat(orderDetails.price_avg);
                                if (sellAvgPrice > 0) soldQty = revenueAmount / sellAvgPrice;
                            } else {
                                console.warn(`[AUTOBOT][${botStateObj.userId}] ⚠️ ADVERTENCIA: Campos no estándar en orderDetails para VENTA monitoreada. Intentando fallback:`, orderDetails);
                                revenueAmount = parseFloat(orderDetails.total_money || orderDetails.notional_value || '0');
                                soldQty = parseFloat(orderDetails.actual_qty || orderDetails.total_qty || '0');
                                if (soldQty > 0) sellAvgPrice = revenueAmount / soldQty;
                            }

                            if (soldQty <= 0 || revenueAmount <= 0 || sellAvgPrice <= 0) {
                                console.error(`[AUTOBOT][${botStateObj.userId}] ❌ Error: No se pudieron extraer valores válidos de la orden de venta monitoreada ID ${botStateObj.orderId}.`);
                                botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                                if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                                    botStateObj.state = 'ESPERA';
                                    botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al procesar detalles de orden de venta monitoreada.`;
                                }
                                await saveBotState(botStateObj);
                                break;
                            }

                            botStateObj.failedOrderAttempts = 0; // Resetear si la orden se procesó con éxito

                            const commissionRate = 0.001; 
                            const buyCommission = botStateObj.totalInvestedUSDT * commissionRate;
                            const sellCommission = revenueAmount * commissionRate;

                            botStateObj.cycleProfit = revenueAmount - botStateObj.totalInvestedUSDT - buyCommission - sellCommission;
                            botStateObj.profit += botStateObj.cycleProfit;

                            console.log(`[AUTOBOT][${botStateObj.userId}] Ciclo ${botStateObj.cycle} completado. Ganancia/Pérdida del ciclo: ${botStateObj.cycleProfit.toFixed(2)} USDT. Ganancia total: ${botStateObj.profit.toFixed(2)} USDT.`);

                            if (botStateObj.stopAtCycleEnd) {
                                console.log(`[AUTOBOT][${botStateObj.userId}] Bandera "Stop on Cycle End" activada. Deteniendo el bot al final del ciclo.`);
                                await stopBotStrategy(botStateObj, bitmartCreds);
                                return;
                            }

                            resetCycleVariables(botStateObj);
                            botStateObj.cycle = 1; // Inicia el nuevo ciclo en 1.
                            botStateObj.state = 'RUNNING'; // Volver a RUNNING para esperar nueva señal de COMPRA
                            console.log(`[AUTOBOT][${botStateObj.userId}] Bot listo para el nuevo ciclo en estado RUNNING.`);
                        } else if (orderDetails && orderDetails.state === 'canceled') {
                            console.warn(`[AUTOBOT][${botStateObj.userId}] ⚠️ Orden de VENTA ID ${botStateObj.orderId} CANCELADA. Volviendo al monitoreo de venta.`);
                            botStateObj.orderId = null;
                            botStateObj.orderType = null;
                            botStateObj.orderPlacedTime = null;
                            botStateObj.failedOrderAttempts = 0;
                            await saveBotState(botStateObj);
                        } else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                            console.log(`[AUTOBOT][${botStateObj.userId}] Orden de VENTA ID ${botStateObj.orderId} aún ${orderDetails.state}. Esperando cumplimiento.`);
                            botStateObj.failedOrderAttempts = 0;
                        } else {
                            console.error(`[AUTOBOT][${botStateObj.userId}] Estado desconocido o inesperado para orden de venta ID ${botStateObj.orderId}:`, orderDetails);
                            botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                            if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                                botStateObj.state = 'ESPERA';
                                botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al obtener estado de orden de venta ID ${botStateObj.orderId}.`;
                            }
                        }
                    } catch (orderDetailError) {
                        console.error(`[AUTOBOT][${botStateObj.userId}] Error al obtener detalles de la orden de venta ${botStateObj.orderId}:`, orderDetailError.message);
                        botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
                        if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                            botStateObj.state = 'ESPERA';
                            botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) al comunicarse con BitMart para detalles de orden de venta.`;
                        }
                    }
                }
                await saveBotState(botStateObj);
                break;

            case 'NO_COVERAGE':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: NO_COVERAGE. Esperando fondos para la próxima orden de ${botStateObj.purchase.toFixed(2)} USDT.`);
                // Si hay balance suficiente, volver a BUYING para intentar la orden.
                if (availableUSDT >= botStateObj.purchase && botStateObj.purchase >= MIN_USDT_VALUE_FOR_BITMART) {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Fondos disponibles. Volviendo a estado BUYING para intentar la orden de compra.`);
                    botStateObj.state = 'BUYING';
                    botStateObj.failedOrderAttempts = 0; // Resetear intentos al recuperar cobertura
                    botStateObj.reason = ''; // Limpiar la razón de NO_COVERAGE
                }
                await saveBotState(botStateObj);
                break;

            case 'ESPERA': // Nuevo estado para manejo de errores graves o suspensión temporal
                console.warn(`[AUTOBOT][${botStateObj.userId}] Estado: ESPERA. El bot está en pausa debido a errores o condiciones no óptimas. Razón: ${botStateObj.reason || 'Desconocida'}.`);
                // El bot permanecerá en este estado hasta que se resuelva la causa o el usuario lo reinicie.
                // No hacer nada más que esperar a que el usuario intervenga o el error se resuelva.
                break;
                
            case 'STOPPED':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: STOPPED. El bot está inactivo.`);
                break;

            default:
                console.warn(`[AUTOBOT][${botStateObj.userId}] Estado desconocido del bot: ${botStateObj.state}. Estableciendo a STOPPED.`);
                botStateObj.state = 'STOPPED';
                botStateObj.isRunning = false;
                botStateObj.reason = `Estado desconocido: ${botStateObj.state}.`;
                await saveBotState(botStateObj);
                break;
        }

    } catch (error) {
        console.error(`❌ Falló la ejecución de la lógica del bot para ${botStateObj.userId}:`, error.message);
        // Si el error es debido a credenciales inválidas, intenta detener el bot y notificar
        if (error.message.includes('Error interno del servidor al obtener y desencriptar credenciales de BitMart') || error.message.includes('API keys not configured')) {
            console.error(`[AUTOBOT][${botStateObj.userId}] Credenciales de BitMart inválidas o no configuradas. Deteniendo el bot.`);
            if (botStateObj) {
                botStateObj.state = 'STOPPED';
                botStateObj.isRunning = false;
                botStateObj.reason = 'Credenciales de BitMart inválidas o no configuradas.';
                await saveBotState(botStateObj);
                if (ioInstance) {
                    ioInstance.emit('botError', { message: 'Credenciales de BitMart inválidas o no configuradas. Bot detenido.' });
                }
            }
        } else {
            // Para otros errores no específicos de credenciales
            botStateObj.failedOrderAttempts = (botStateObj.failedOrderAttempts || 0) + 1;
            if (botStateObj.failedOrderAttempts >= MAX_FAILED_ATTEMPTS) {
                botStateObj.state = 'ESPERA';
                botStateObj.reason = `Demasiados fallos (${MAX_FAILED_ATTEMPTS}) en la ejecución general de la lógica del bot: ${error.message}`;
            }
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

    // Actualizar parámetros del bot desde el frontend
    Object.assign(botState, botParams);
    
    // CAMBIO: Asegurarse de que el contador de fallos y la razón estén limpios al inicio
    botState.failedOrderAttempts = 0;
    botState.reason = '';

    // Si el bot se inicia y no hay activo (AC=0), se considera un nuevo ciclo
    // y se establece en RUNNING para esperar la señal de compra.
    // Si ya hay activo (AC>0), significa que se está reanudando un ciclo con una posición abierta.
    if (botState.ac === 0) {
        resetCycleVariables(botState); // Asegura que todas las variables del ciclo estén limpias
        botState.cycle = 1; // Inicia el ciclo en 1 para la primera compra
        botState.state = 'RUNNING'; // CAMBIO: Siempre inicia en RUNNING si es un ciclo nuevo
        console.log(`[AUTOBOT][${userId}] Se inicia un NUEVO ciclo (AC=0). Estado inicial: RUNNING.`);
    } else {
        // Si hay AC existente, se reanuda el ciclo, y el bot pasa a BUYING para gestionar la posición.
        botState.state = 'BUYING'; // CAMBIO: Si hay AC, reanuda en BUYING
        console.log(`[AUTOBOT][${userId}] Reanudando ciclo con AC existente: ${botState.ac.toFixed(8)} BTC. Estado: BUYING.`);
    }
    
    botState.isRunning = true; // Siempre true al iniciar

    await saveBotState(botState); // Guarda el estado inicial actualizado

    // Limpiar cualquier intervalo existente para este usuario
    if (userBotIntervals.has(userId)) {
        clearInterval(userBotIntervals.get(userId));
        userBotIntervals.delete(userId);
    }

    // Ejecutar la lógica del bot inmediatamente y luego en un intervalo
    await runBotLogic(botState, bitmartCreds); // Primera ejecución inmediata
    const intervalId = setInterval(async () => {
        let latestBotState = await loadBotStateForUser(userId);
        // CAMBIO: Verificación de estados para continuar
        if (latestBotState.isRunning && !['STOPPED', 'ERROR', 'ESPERA'].includes(latestBotState.state)) {
            await runBotLogic(latestBotState, bitmartCreds);
        } else {
            console.log(`[AUTOBOT][${userId}] El bot no está en estado activo (${latestBotState.state}). Deteniendo intervalo.`);
            clearInterval(userBotIntervals.get(userId));
            userBotIntervals.delete(userId);
            // Asegúrate de que el estado en DB se refleje como STOPPED/ERROR/ESPERA si no lo está ya.
            if (!['STOPPED', 'ERROR', 'ESPERA'].includes(latestBotState.state)) {
                latestBotState.state = 'STOPPED';
                latestBotState.isRunning = false;
                latestBotState.reason = 'Intervalo detenido debido a estado inactivo.';
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
    const cancellationSuccess = await cancelOpenOrders(bitmartCreds, TRADE_SYMBOL);
    if (!cancellationSuccess) {
        console.error(`[AUTOBOT][${botStateObj.userId}] No se pudieron cancelar todas las órdenes abiertas al detener el bot.`);
        botStateObj.reason = 'No se pudieron cancelar todas las órdenes abiertas al detener el bot.';
    }

    botStateObj.state = 'STOPPED';
    botStateObj.isRunning = false;
    // CAMBIO: Reiniciar el contador de fallos y razón al detener el bot
    botStateObj.failedOrderAttempts = 0; 
    // Si ya había una razón de error, mantenerla a menos que la detención sea "limpia"
    if (!botStateObj.reason.includes('No se pudieron cancelar')) { // Evitar sobrescribir si hubo error de cancelación
        botStateObj.reason = 'Detenido por el usuario.'; 
    }
    await saveBotState(botStateObj);
    console.log(`[AUTOBOT] Estrategia detenida y estado actualizado en DB para ${botStateObj.userId}.`);
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
        if (!botState.isRunning && botState.state === 'STOPPED') { // CAMBIO: Revisa también el estado explícitamente
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
    init,
    loadBotStateForUser,
    saveBotState,
    toggleBotState,
};
