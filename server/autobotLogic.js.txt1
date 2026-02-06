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
                if (botStateObj.pm === 0 || botStateObj.currentPrice > botStateObj.pm) {
                    botStateObj.pm = botStateObj.currentPrice;
                    
                    // Calcula el precio de venta (pv) como PM - 0.5% (o el porcentaje que defina tu estrategia)
                    botStateObj.pv = botStateObj.pm * (1 - 0.005);    
                    botStateObj.pc = botStateObj.pm * (1 - 0.004); // Este es un ejemplo, ajusta el porcentaje de caída (0.4%)
                }
                if ((botStateObj.currentPrice <= botStateObj.pc) && botStateObj.ac > 0) {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Condiciones de venta alcanzadas! Colocando orden de venta.`);
                    await placeSellOrder(botStateObj, bitmartCreds); // Pasar botStateObj y credenciales
                } else {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Esperando condiciones para la venta. Precio actual: ${botStateObj.currentPrice.toFixed(2)}, PM: ${botStateObj.pm.toFixed(2)}, PV: ${botStateObj.pv.toFixed(2)}, PC: ${botStateObj.pc.toFixed(2)}`);
                }
                break;

            case 'NO_COVERAGE':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: NO_COVERAGE. Esperando fondos para la próxima orden de ${botStateObj.nextCoverageUSDTAmount.toFixed(2)} USDT @ ${botStateObj.nextCoverageTargetPrice.toFixed(2)}.`);
                if (availableUSDT >= botStateObj.nextCoverageUSDTAmount && botStateObj.nextCoverageUSDTAmount >= MIN_USDT_VALUE_FOR_BITMART) {
                    console.log(`[AUTOBOT][${botStateObj.userId}] Fondos disponibles. Volviendo a estado BUYING para intentar la orden de cobertura.`);
                    botStateObj.state = 'BUYING';
                }
                break;

            case 'ERROR':
                console.error(`[AUTOBOT][${botStateObj.userId}] Estado: ERROR. El bot ha encontrado un error crítico. Requiere intervención manual.`);
                break;
            case 'STOPPED':
                console.log(`[AUTOBOT][${botStateObj.userId}] Estado: STOPPED. El bot está inactivo.`);
                break;
            default:
                console.warn(`[AUTOBOT][${botStateObj.userId}] Estado desconocido del bot: ${botStateObj.state}. Estableciendo a STOPPED.`);
                botStateObj.state = 'STOPPED';
                break;
        }

        // Siempre guarda el estado después de cada ciclo de lógica
        await saveBotState(botStateObj);

    } catch (error) {
        console.error(`❌ Falló la ejecución de la lógica del bot para ${botStateObj.userId}:`, error.message);
        // Si el error es debido a credenciales inválidas, intenta detener el bot y notificar
        if (error.message.includes('Error interno del servidor al obtener y desencriptar credenciales de BitMart') || error.message.includes('API keys not configured')) {
            console.error(`[AUTOBOT][${botStateObj.userId}] Credenciales de BitMart inválidas o no configuradas. Deteniendo el bot.`);
            // Asegúrate de que botStateObj esté definido antes de intentar cambiar su estado
            if (botStateObj) {
                botStateObj.state = 'STOPPED';
                await saveBotState(botStateObj);
                // Emitir un evento al frontend para notificar sobre el problema de credenciales
                if (ioInstance) {
                    ioInstance.emit('botError', { message: 'Credenciales de BitMart inválidas o no configuradas. Bot detenido.' });
                }
            }
        }
        // Puedes cambiar el estado del bot a 'ERROR' si deseas una intervención manual
        // botStateObj.state = 'ERROR';
        // await saveBotState(botStateObj);
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
    botState.state = 'RUNNING'; // Establecer estado inicial a RUNNING al iniciar
    botState.isRunning = true;

    // Si es el inicio de un nuevo ciclo (AC=0), resetear variables del ciclo
    if (botState.ac === 0) {
        resetCycleVariables(botState);
        botState.cycle = 1; // Inicia el ciclo en 1 si no hay activo
    } else {
        console.log(`[AUTOBOT][${userId}] Reanudando bot con AC existente: ${botState.ac.toFixed(8)} BTC. Estado: ${botState.state}`);
        // Si hay AC y el estado es RUNNING o STOPPED, forzar a BUYING para continuar el ciclo
        if (botState.state === 'RUNNING' || botState.state === 'STOPPED') {
             botState.state = 'BUYING';
             console.log(`[AUTOBOT][${userId}] Estado ajustado a BUYING para reanudar ciclo con AC existente.`);
        }
    }


    await saveBotState(botState); // Guarda el estado inicial de RUNNING

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
        if (latestBotState.isRunning && latestBotState.state !== 'STOPPED' && latestBotState.state !== 'ERROR') {
             await runBotLogic(latestBotState, bitmartCreds);
        } else {
            console.log(`[AUTOBOT][${userId}] El bot no está en estado RUNNING/BUYING/SELLING. Deteniendo intervalo.`);
            clearInterval(userBotIntervals.get(userId));
            userBotIntervals.delete(userId);
            // Asegúrate de que el estado en DB se refleje como STOPPED/ERROR si no lo está ya.
            if (latestBotState.state !== 'STOPPED' && latestBotState.state !== 'ERROR') {
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
