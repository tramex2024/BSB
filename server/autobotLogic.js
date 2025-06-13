// server/autobotLogic.js
// Este archivo contiene toda la lógica central del bot de trading.

const bitmartService = require('./services/bitmartService'); // Asegúrate de que esta ruta sea correcta
const BotState = require('./models/BotState'); // Import the BotState model
const axios = require('axios'); // Necesitaremos axios si implementas indicadores reales

// ¡IMPORTA TU ANALIZADOR DE INDICADORES AQUÍ!
// Asegúrate de que la ruta sea correcta según donde tengas guardado bitmart_indicator_analyzer.js
const bitmartIndicatorAnalyzer = require('./bitmart_indicator_analyzer');

// --- CONSTANTES DEL BOT ---
const TRADE_SYMBOL = 'BTC_USDT'; // Define el símbolo para las operaciones del bot
const MIN_USDT_VALUE_FOR_BITMART = 5; // Valor mínimo de USDT para una orden en BitMart
const BASE_CURRENCY = 'BTC'; // La moneda que operas
const QUOTE_CURRENCY = 'USDT'; // La moneda base para los cálculos de profit/purchase

// ID de usuario por defecto para el bot.
// Este ID se usará para la inicialización global del botState o como fallback.
// Las operaciones de usuario específicas usarán el userId pasado como parámetro.
const DEFAULT_BOT_USER_ID = process.env.BOT_USER_ID || 'un_id_de_usuario_para_el_bot_global';


// --- ESTADO GLOBAL DEL BOT ---
// Este objeto es el estado global/por defecto del bot.
// Las operaciones por usuario cargarán y guardarán su propio estado.
let botState = {
    userId: DEFAULT_BOT_USER_ID,
    state: 'STOPPED',
    cycle: 0,
    profit: 0,
    cycleProfit: 0, // Ganancia o pérdida del ciclo actual
    currentPrice: 0,
    purchaseAmount: 0, // ORDER SIZE del frontend
    incrementPercentage: 0, // INCREMENT del frontend
    decrementPercentage: 0, // DECREMENT del frontend
    triggerPercentage: 0, // TRIGGER del frontend
    ppc: 0, // Precio Promedio de Compra
    cp: 0,  // Capital Comprado (total USDT gastado en el ciclo)
    ac: 0,  // Activo Comprado (total BTC adquirido en el ciclo)
    pm: 0,  // Precio Máximo (usado en estado SELLING)
    pv: 0,  // Precio de Venta (calculado a partir de PM)
    pc: 0,  // Precio de Caída (usado en estado SELLING)
    lastOrder: null, // Detalles de la última orden (para calcular siguiente decrecimiento)
    openOrders: [], // Mantener un registro de órdenes abiertas colocadas por el bot
    strategyIntervalId: null, // Para manejar el setInterval (no persistirá en DB)
    orderCountInCycle: 0, // Nuevo: Contador de órdenes en el ciclo actual
    lastOrderUSDTAmount: 0, // Nuevo: Monto en USDT de la última orden
    nextCoverageUSDTAmount: 0, // Nuevo: Monto para la próxima orden de cobertura
    nextCoverageTargetPrice: 0, // Nuevo: Precio objetivo para la próxima orden de cobertura
    stopOnCycleEnd: false // NUEVO: Bandera para detener al final del ciclo
};

// Referencia global para Socket.IO (se inyectará desde server.js)
let ioInstance;

// Almacén para los setIntervals de cada bot de usuario
// Key: userId, Value: intervalId
const userBotIntervals = {};

// Función para inyectar la instancia de Socket.IO
function setIoInstance(io) {
    ioInstance = io;
    console.log('[AUTOBOT] Socket.IO instance attached to autobotLogic.');
}

// --- Funciones para manejar el estado del bot por usuario ---

// Carga el estado de un bot específico desde la DB para un userId dado
async function getBotStateForUser(userId) {
    try {
        const savedState = await BotState.findOne({ userId: userId });
        if (savedState) {
            // Retorna una copia limpia del objeto del documento de Mongoose
            const state = savedState.toObject();
            // Asegúrate de que strategyIntervalId NO se carga desde la DB, es un runtime value
            state.strategyIntervalId = userBotIntervals[userId] || null;
            return state;
        } else {
            // Si no hay estado para este usuario, devuelve un estado por defecto.
            // Asegúrate de usar el userId proporcionado aquí.
            return {
                userId: userId,
                state: 'STOPPED',
                cycle: 0, profit: 0, cycleProfit: 0, currentPrice: 0,
                purchaseAmount: 0, incrementPercentage: 0, decrementPercentage: 0, triggerPercentage: 0,
                ppc: 0, cp: 0, ac: 0, pm: 0, pv: 0, pc: 0, lastOrder: null, openOrders: [],
                orderCountInCycle: 0, lastOrderUSDTAmount: 0, nextCoverageUSDTAmount: 0, nextCoverageTargetPrice: 0,
                stopOnCycleEnd: false,
                strategyIntervalId: null
            };
        }
    } catch (error) {
        console.error(`❌ Error obteniendo estado del bot para el usuario ${userId}:`, error.message);
        throw error;
    }
}

// Guarda el estado de un bot específico en la DB para un userId dado
async function saveBotStateForUser(userId, stateToSave) {
    try {
        // Asegúrate de que strategyIntervalId NO se guarda en la DB
        const stateForDB = { ...stateToSave };
        delete stateForDB.strategyIntervalId;

        await BotState.findOneAndUpdate(
            { userId: userId },
            stateForDB,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        console.log(`[DB] Estado del bot guardado para el usuario ${userId}.`);
    } catch (error) {
        console.error(`❌ Error guardando estado del bot para el usuario ${userId} en DB:`, error.message);
        throw error;
    }
}


// Carga el estado del bot por defecto o el último estado global al iniciar el servidor.
// Esta función NO debe usarse para cargar estados de bots de usuario específicos.
async function loadBotStateFromDB() {
    try {
        const savedState = await BotState.findOne({ userId: DEFAULT_BOT_USER_ID });
        if (savedState) {
            Object.assign(botState, savedState.toObject());
            console.log('[DB] Estado del bot global cargado desde la base de datos.');

            // Si el bot global estaba en RUNNING, lo forzamos a STOPPED al cargar.
            // Los bots de usuario específicos se inicializarán por demanda.
            if (botState.strategyIntervalId) { // Limpiar cualquier intervalo que pudiera haber quedado si el server se cerró mal
                clearInterval(botState.strategyIntervalId);
                botState.strategyIntervalId = null;
            }
            if (botState.state !== 'STOPPED') {
                 console.warn(`[DB] Bot global estaba en estado ${botState.state}. Se ha reiniciado en STOPPED.`);
                 botState.state = 'STOPPED';
            }
            if (ioInstance) {
                // Emitir el estado del bot global (solo para información general, no para un usuario específico)
                // O considera no emitir este estado global si solo manejas bots por usuario.
                // ioInstance.emit('botStateUpdate', botState); // COMENTADO: Evita emitir estado global al inicio si es sólo para usuarios
            }
        } else {
            console.log('[DB] No hay estado de bot global guardado. Iniciando con estado por defecto.');
            const initialBotState = new BotState(botState); // Usar el estado por defecto definido arriba
            await initialBotState.save();
            console.log('[DB] Nuevo estado de bot global por defecto guardado.');
            if (ioInstance) {
                // ioInstance.emit('botStateUpdate', botState); // COMENTADO: Evita emitir estado global al inicio
            }
        }
    } catch (error) {
        console.error('❌ Error cargando estado del bot global desde DB:', error.message);
    }
}


// --- Función para resetear las variables del ciclo de un bot específico ---
async function resetCycleVariables(userId) {
    console.log(`[AUTOBOT] Reseteando variables del ciclo para el usuario ${userId}.`);
    const currentState = await getBotStateForUser(userId);
    currentState.ppc = 0;
    currentState.cp = 0;
    currentState.ac = 0;
    currentState.pm = 0;
    currentState.pv = 0;
    currentState.pc = 0;
    currentState.lastOrder = null;
    currentState.openOrders = [];
    currentState.cycleProfit = 0; // También resetear la ganancia del ciclo
    currentState.orderCountInCycle = 0; // Resetear
    currentState.lastOrderUSDTAmount = 0; // Resetear
    currentState.nextCoverageUSDTAmount = 0;
    currentState.nextCoverageTargetPrice = 0;
    await saveBotStateForUser(userId, currentState);
    return currentState;
}

// --- Función para cancelar órdenes abiertas ---
// Nota: Esta función necesitaría las API keys del usuario para funcionar.
// DEBERÁS MODIFICAR bitmartService.js para que sus funciones acepten userId
// y obtengan las API keys del usuario desde la DB.
async function cancelOpenOrders(userId, symbol) {
    console.log(`[AUTOBOT] Intentando cancelar todas las órdenes abiertas para ${symbol} (user: ${userId})...`);
    try {
        // --- ADVERTENCIA: SIMULACIÓN ---
        // DEBERÁS DESCOMENTAR EL CÓDIGO REAL DE BITMART Y AJUSTAR bitmartService.js
        // para que use las API keys del userId proporcionado.
        
        // const openOrders = await bitmartService.getOpenOrders(userId, symbol); // Pasa userId
        // if (openOrders && openOrders.orders && openOrders.orders.length > 0) {
        //     for (const order of openOrders.orders) {
        //         console.log(`[AUTOBOT] Cancelando orden: ${order.order_id}...`);
        //         await bitmartService.cancelOrder(userId, symbol, order.order_id); // Pasa userId
        //         console.log(`[AUTOBOT] Orden ${order.order_id} cancelada.`);
        //     }
        //     console.log(`[AUTOBOT] Todas las ${openOrders.orders.length} órdenes abiertas para ${symbol} han sido canceladas.`);
        // } else {
        //     console.log('[AUTOBOT] No se encontraron órdenes abiertas para cancelar.');
        // }

        const currentUserBotState = await getBotStateForUser(userId);
        currentUserBotState.openOrders = []; // Simula la cancelación
        await saveBotStateForUser(userId, currentUserBotState);
        console.log(`[AUTOBOT] Órdenes simuladamente canceladas para ${symbol} (user: ${userId}).`);
    } catch (error) {
        console.error(`[AUTOBOT] Error al cancelar órdenes abiertas para ${userId}:`, error.message);
    }
}

// --- Funciones de Colocación de Órdenes (adaptadas para un userId) ---
// NOTA IMPORTANTE: Estas funciones DEBEN poder acceder a las API keys del usuario.
// Implica MODIFICAR `bitmartService.js` para que sus funciones (`getBalance`, `placeOrder`, `getOrderDetail`)
// acepten un `userId` y obtengan las API keys de la DB, o se inyecten las claves en el contexto del servicio.

async function placeFirstBuyOrder(userId) {
    const currentUserBotState = await getBotStateForUser(userId);
    console.log(`[AUTOBOT] Intentando colocar la primera orden de compra (CICLO ${currentUserBotState.cycle}) para el usuario ${userId}...`);
    
    const tradeSymbol = TRADE_SYMBOL;
    const orderType = 'market';
    const side = 'buy';
    const sizeUSDT = currentUserBotState.purchaseAmount;

    // Obtener balance y precio actual para asegurar la compra
    // DEBERÁS MODIFICAR bitmartService.js para que getBalance acepte userId y obtenga las keys
    const balanceInfo = await bitmartService.getBalance(userId); 
    const usdtBalance = balanceInfo.find(b => b.currency === QUOTE_CURRENCY);
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;

    if (availableUSDT < sizeUSDT) {
        console.warn(`[AUTOBOT] Balance insuficiente para la primera orden de ${userId}. Necesario: ${sizeUSDT} USDT, Disponible: ${availableUSDT.toFixed(2)} USDT.`);
        currentUserBotState.state = 'NO_COVERAGE';
        await saveBotStateForUser(userId, currentUserBotState);
        return;
    }
    if (currentUserBotState.currentPrice === 0) {
        console.error(`[AUTOBOT] Precio actual no disponible para la primera orden de ${userId}. Reintentando...`);
        currentUserBotState.state = 'RUNNING';
        await saveBotStateForUser(userId, currentUserBotState);
        return;
    }

    if (sizeUSDT < MIN_USDT_VALUE_FOR_BITMART) {
        console.error(`[AUTOBOT] El valor de la orden (${sizeUSDT} USDT) para ${userId} es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART} USDT). Ajusta tu PURCHASE.`);
        currentUserBotState.state = 'STOPPED';
        await saveBotStateForUser(userId, currentUserBotState);
        return;
    }

    try {
        const sizeBTC = parseFloat((sizeUSDT / currentUserBotState.currentPrice).toFixed(8));
        console.log(`[AUTOBOT] Colocando orden de COMPRA (MARKET) para ${userId}: ${sizeBTC.toFixed(8)} ${BASE_CURRENCY} por ${sizeUSDT.toFixed(2)} ${QUOTE_CURRENCY}.`);
        
        // --- ADVERTENCIA: SIMULACIÓN ---
        // DEBERÁS DESCOMENTAR EL CÓDIGO REAL DE BITMART Y AJUSTAR bitmartService.js
        // const orderResult = await bitmartService.placeOrder(userId, tradeSymbol, side, orderType, sizeUSDT.toString());
        // const filledOrder = await bitmartService.getOrderDetail(userId, orderResult.order_id);

        // Simulación de orden exitosa
        const simulatedOrderId = `sim_buy_${Date.now()}`;
        const simulatedFilledOrder = {
            order_id: simulatedOrderId,
            state: 'filled',
            price: currentUserBotState.currentPrice,
            filled_size: sizeBTC.toString()
        };
        const orderResult = { order_id: simulatedOrderId };
        const filledOrder = simulatedFilledOrder;
        // --- FIN SIMULACIÓN ---


        if (orderResult && orderResult.order_id) {
            currentUserBotState.lastOrder = {
                orderId: orderResult.order_id,
                price: currentUserBotState.currentPrice,
                size: sizeBTC,
                side: 'buy',
                type: 'market',
                state: 'new'
            };
            currentUserBotState.openOrders.push(currentUserBotState.lastOrder);

            console.log(`[AUTOBOT] Primera orden colocada para ${userId}: ID ${orderResult.order_id}. Monitoreando...`);

            await new Promise(resolve => setTimeout(resolve, 2000)); // Simula tiempo de procesamiento

            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price);
                const actualSize = parseFloat(filledOrder.filled_size);
                const actualAmountUSD = actualPrice * actualSize;

                currentUserBotState.ppc = actualPrice;
                currentUserBotState.cp = actualAmountUSD;
                currentUserBotState.ac = actualSize;
                currentUserBotState.cycle = 1;
                currentUserBotState.orderCountInCycle = 1;
                currentUserBotState.lastOrderUSDTAmount = actualAmountUSD;

                currentUserBotState.openOrders = currentUserBotState.openOrders.filter(o => o.orderId !== orderResult.order_id);

                console.log(`[AUTOBOT] Primera orden de compra COMPLETA para ${userId}. PPC: ${currentUserBotState.ppc.toFixed(2)}, CP: ${currentUserBotState.cp.toFixed(2)}, AC: ${currentUserBotState.ac.toFixed(5)} ${BASE_CURRENCY}. Órdenes en ciclo: ${currentUserBotState.orderCountInCycle}`);
                currentUserBotState.state = 'BUYING';
            } else {
                console.warn(`[AUTOBOT] La primera orden ${orderResult.order_id} para ${userId} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
                currentUserBotState.state = 'RUNNING';
            }
        } else {
            console.error(`[AUTOBOT] Error al colocar la primera orden para ${userId}: No se recibió order_id o la respuesta es inválida.`);
            currentUserBotState.state = 'RUNNING';
        }
    } catch (error) {
        console.error(`[AUTOBOT] Excepción al colocar la primera orden para ${userId}:`, error.message);
        currentUserBotState.state = 'RUNNING';
    } finally {
        await saveBotStateForUser(userId, currentUserBotState);
        if (ioInstance) ioInstance.to(userId).emit('botStateUpdate', currentUserBotState);
    }
}

async function placeCoverageBuyOrder(userId) {
    const currentUserBotState = await getBotStateForUser(userId);
    console.log(`[AUTOBOT] Intentando colocar orden de compra de COBERTURA (CICLO ${currentUserBotState.cycle}) para el usuario ${userId}...`);
    
    const tradeSymbol = TRADE_SYMBOL;
    const side = 'buy';
    const orderType = 'limit';
    const sizeUSDT = currentUserBotState.nextCoverageUSDTAmount;
    const targetPrice = currentUserBotState.nextCoverageTargetPrice;

    // DEBERÁS MODIFICAR bitmartService.js para que getBalance acepte userId y obtenga las keys
    const balanceInfo = await bitmartService.getBalance(userId); 
    const usdtBalance = balanceInfo.find(b => b.currency === QUOTE_CURRENCY);
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;

    if (availableUSDT < sizeUSDT || sizeUSDT < MIN_USDT_VALUE_FOR_BITMART) {
        console.warn(`[AUTOBOT] Balance insuficiente (${availableUSDT.toFixed(2)} ${QUOTE_CURRENCY}) o monto de orden (${sizeUSDT.toFixed(2)} ${QUOTE_CURRENCY}) es menor al mínimo para orden de cobertura para ${userId}. Cambiando a NO_COVERAGE.`);
        currentUserBotState.state = 'NO_COVERAGE';
        await saveBotStateForUser(userId, currentUserBotState);
        return;
    }

    if (currentUserBotState.currentPrice === 0) {
        console.error(`[AUTOBOT] Precio actual no disponible para orden de cobertura para ${userId}.`);
        return;
    }

    try {
        const sizeBTC = parseFloat((sizeUSDT / targetPrice).toFixed(8));
        console.log(`[AUTOBOT] Colocando orden de COMPRA (LIMIT) de cobertura para ${userId}: ${sizeBTC.toFixed(8)} ${BASE_CURRENCY} a ${targetPrice.toFixed(2)} ${QUOTE_CURRENCY}.`);
        
        // --- ADVERTENCIA: SIMULACIÓN ---
        // DEBERÁS DESCOMENTAR EL CÓDIGO REAL DE BITMART Y AJUSTAR bitmartService.js
        // const orderResult = await bitmartService.placeOrder(userId, tradeSymbol, side, orderType, sizeUSDT.toString(), targetPrice.toFixed(2));
        // const filledOrder = await bitmartService.getOrderDetail(userId, orderResult.order_id);

        // Simulación de orden exitosa
        const simulatedOrderId = `sim_cov_buy_${Date.now()}`;
        const simulatedFilledOrder = {
            order_id: simulatedOrderId,
            state: 'filled',
            price: targetPrice,
            filled_size: sizeBTC.toString()
        };
        const orderResult = { order_id: simulatedOrderId };
        const filledOrder = simulatedFilledOrder;
        // --- FIN SIMULACIÓN ---


        if (orderResult && orderResult.order_id) {
            const newOrder = {
                orderId: orderResult.order_id,
                price: targetPrice,
                size: sizeBTC,
                side: 'buy',
                type: 'limit',
                state: 'new'
            };
            currentUserBotState.openOrders.push(newOrder);
            console.log(`[AUTOBOT] Orden de cobertura colocada para ${userId}: ID ${orderResult.order_id}. Monitoreando...`);
            
            await new Promise(resolve => setTimeout(resolve, 2000)); // Simula tiempo de procesamiento

            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price);
                const actualSize = parseFloat(filledOrder.filled_size);
                const actualAmountUSD = actualPrice * actualSize;

                currentUserBotState.ac += actualSize;
                currentUserBotState.cp += actualAmountUSD;
                currentUserBotState.ppc = currentUserBotState.cp / currentUserBotState.ac;
                currentUserBotState.orderCountInCycle++;
                currentUserBotState.lastOrderUSDTAmount = actualAmountUSD;

                currentUserBotState.lastOrder = {
                    orderId: orderResult.order_id,
                    price: actualPrice,
                    size: actualSize,
                    side: side,
                    type: 'limit',
                    state: 'filled'
                };
                currentUserBotState.openOrders = currentUserBotState.openOrders.filter(o => o.orderId !== orderResult.order_id);

                console.log(`[AUTOBOT] Orden de cobertura COMPLETA para ${userId}. Nuevo AC: ${currentUserBotState.ac.toFixed(8)}, Nuevo CP: ${currentUserBotState.cp.toFixed(2)}, Nuevo PPC: ${currentUserBotState.ppc.toFixed(2)}. Ordenes en ciclo: ${currentUserBotState.orderCountInCycle}`);
                // state permanece en 'BUYING'
            } else {
                console.warn(`[AUTOBOT] La orden de cobertura ${orderResult.order_id} para ${userId} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
            }
        } else {
            console.error(`[AUTOBOT] Error al colocar orden de cobertura para ${userId}: No se recibió order_id o la respuesta es inválida.`);
        }
    } catch (error) {
        console.error(`[AUTOBOT] Excepción al colocar orden de cobertura para ${userId}:`, error.message);
    } finally {
        await saveBotStateForUser(userId, currentUserBotState);
        if (ioInstance) ioInstance.to(userId).emit('botStateUpdate', currentUserBotState);
    }
}

async function placeSellOrder(userId) {
    const currentUserBotState = await getBotStateForUser(userId);
    console.log(`[AUTOBOT] Intentando colocar orden de VENTA (CICLO ${currentUserBotState.cycle}) para el usuario ${userId}...`);
    
    const tradeSymbol = TRADE_SYMBOL;
    const side = 'sell';
    const orderType = 'market';
    const sizeBTC = currentUserBotState.ac;

    if (currentUserBotState.ac <= 0) {
        console.warn(`[AUTOBOT] No hay activo para vender (AC = 0) para el usuario ${userId}.`);
        currentUserBotState.state = 'RUNNING';
        await saveBotStateForUser(userId, currentUserBotState);
        return;
    }

    try {
        console.log(`[AUTOBOT] Colocando orden de VENTA (MARKET) para ${userId}: ${sizeBTC.toFixed(8)} ${BASE_CURRENCY} a precio de ${currentUserBotState.currentPrice.toFixed(2)} ${QUOTE_CURRENCY}.`);
        
        // --- ADVERTENCIA: SIMULACIÓN ---
        // DEBERÁS DESCOMENTAR EL CÓDIGO REAL DE BITMART Y AJUSTAR bitmartService.js
        // const orderResult = await bitmartService.placeOrder(userId, tradeSymbol, side, orderType, sizeBTC.toString());
        // const filledOrder = await bitmartService.getOrderDetail(userId, orderResult.order_id);

        // Simulación de orden exitosa
        const simulatedOrderId = `sim_sell_${Date.now()}`;
        const simulatedFilledOrder = {
            order_id: simulatedOrderId,
            state: 'filled',
            price: currentUserBotState.currentPrice,
            filled_size: sizeBTC.toString()
        };
        const orderResult = { order_id: simulatedOrderId };
        const filledOrder = simulatedFilledOrder;
        // --- FIN SIMULACIÓN ---

        if (orderResult && orderResult.order_id) {
            await cancelOpenOrders(userId, TRADE_SYMBOL); // Cancelar órdenes de compra pendientes para este usuario

            await new Promise(resolve => setTimeout(resolve, 2000)); // Simula tiempo de procesamiento

            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price);
                const actualSize = parseFloat(filledOrder.filled_size);
                const revenueFromSale = actualPrice * actualSize;
                const commissionRate = 0.001; // 0.1% (Tasa de comisión de ejemplo, ajusta según BitMart)
                const buyCommission = currentUserBotState.cp * commissionRate;
                const sellCommission = revenueFromSale * commissionRate;

                currentUserBotState.cycleProfit = revenueFromSale - currentUserBotState.cp - buyCommission - sellCommission;
                currentUserBotState.profit += currentUserBotState.cycleProfit;

                console.log(`[AUTOBOT] Ciclo ${currentUserBotState.cycle} completado para ${userId}. Ganancia/Pérdida del ciclo: ${currentUserBotState.cycleProfit.toFixed(2)} ${QUOTE_CURRENCY}. Ganancia total: ${currentUserBotState.profit.toFixed(2)} ${QUOTE_CURRENCY}.`);

                if (currentUserBotState.stopOnCycleEnd) {
                    console.log(`[AUTOBOT] Bandera "Stop on Cycle End" activada para ${userId}. Deteniendo el bot al final del ciclo.`);
                    await stopBotStrategy(userId); // Llama a la función de detención completa para este usuario
                    return;
                }

                await resetCycleVariables(userId); // Resetear variables para el nuevo ciclo para este usuario
                currentUserBotState.cycle++; // Incrementar el ciclo para el nuevo inicio
                currentUserBotState.state = 'RUNNING'; // Volver a RUNNING para que espere la nueva señal de COMPRA
                console.log(`[AUTOBOT] Bot de ${userId} listo para el nuevo ciclo en estado RUNNING, esperando próxima señal de COMPRA.`);

            } else {
                console.warn(`[AUTOBOT] La orden de venta ${orderResult.order_id} para ${userId} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
            }
        } else {
            console.error(`[AUTOBOT] Error al colocar la orden de venta para ${userId}: No se recibió order_id o la respuesta es inválida.`, orderResult);
        }
    } catch (error) {
        console.error(`[AUTOBOT] Excepción al colocar la orden de venta para ${userId}:`, error.message);
    } finally {
        await saveBotStateForUser(userId, currentUserBotState);
        if (ioInstance) ioInstance.to(userId).emit('botStateUpdate', currentUserBotState);
    }
}


// --- Función Principal de Lógica del Bot (ejecutada por setInterval para un userId) ---
async function runBotLogicForUser(userId) {
    let currentUserBotState;
    try {
        currentUserBotState = await getBotStateForUser(userId);
        console.log(`\n--- Ejecutando lógica del bot para usuario ${userId}. Estado actual: ${currentUserBotState.state} ---`);

        // Siempre obtén el precio actual al inicio de cada ejecución del loop
        const ticker = await bitmartService.getTicker(TRADE_SYMBOL);
        if (ticker && ticker.last) {
            currentUserBotState.currentPrice = parseFloat(ticker.last);
            console.log(`[AUTOBOT] Precio actual de BitMart actualizado para ${userId}: ${currentUserBotState.currentPrice.toFixed(2)} ${QUOTE_CURRENCY}`);
        } else {
            console.warn(`[AUTOBOT] No se pudo obtener el precio actual para ${userId}. Reintentando...`);
            return; // Salir si no hay precio, para evitar errores en cálculos
        }

        // Obtener balance actualizado al inicio de cada ciclo para NO_COVERAGE y otras validaciones
        // DEBERÁS MODIFICAR bitmartService.js para que getBalance acepte userId y obtenga las keys
        const balanceInfo = await bitmartService.getBalance(userId); 
        const usdtBalance = balanceInfo.find(b => b.currency === QUOTE_CURRENCY);
        const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;
        const btcBalance = balanceInfo.find(b => b.currency === BASE_CURRENCY);
        const availableBTC = btcBalance ? parseFloat(btcBalance.available) : 0;

        // Emit balance update - IDEALMENTE SOLO AL USUARIO RELEVANTE
        if (ioInstance) {
            ioInstance.to(userId).emit('balanceUpdate', { usdt: availableUSDT, btc: availableBTC });
        }

        // LÓGICA DE VENTA PRIORITARIA (GLOBAL)
        const expectedSellPrice = currentUserBotState.ppc * (1 + currentUserBotState.triggerPercentage / 100);
        if (currentUserBotState.ac > 0 && currentUserBotState.currentPrice >= expectedSellPrice && currentUserBotState.state !== 'SELLING') {
            console.log(`[AUTOBOT] ¡PRECIO DE VENTA GLOBAL ALCANZADO para ${userId}! (${currentUserBotState.currentPrice.toFixed(2)} >= ${expectedSellPrice.toFixed(2)})`);
            console.log(`[AUTOBOT] Transicionando a SELLING para ${userId} para ejecutar la estrategia de venta.`);
            currentUserBotState.state = 'SELLING';
            // Importante: No ponemos un 'return' aquí. Queremos que el switch-case se ejecute
            // y que el estado 'SELLING' maneje el resto de la lógica de venta en este mismo ciclo.
        }

        switch (currentUserBotState.state) {
            case 'RUNNING':
                console.log(`[AUTOBOT] Estado: RUNNING para ${userId}. Esperando señal de entrada de COMPRA desde el analizador de indicadores...`);

                if (currentUserBotState.ac > 0) {
                    console.warn(`[AUTOBOT] Detectado AC > 0 para ${userId} en estado RUNNING. Transicionando a BUYING.`);
                    currentUserBotState.state = 'BUYING';
                } else {
                    const analysisResult = await bitmartIndicatorAnalyzer.runAnalysis(); // Este análisis puede ser general o requerir contexto del usuario
                    console.log(`[AUTOBOT] Analizador de indicadores resultado para ${userId}: ${analysisResult.action} - Razón: ${analysisResult.reason}`);

                    if (analysisResult.action === 'COMPRA') {
                        console.log(`[AUTOBOT] ¡Señal de entrada de COMPRA DETECTADA por los indicadores para ${userId}!`);
                        if (availableUSDT >= currentUserBotState.purchaseAmount && currentUserBotState.purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART) {
                            currentUserBotState.state = 'BUYING';
                            await placeFirstBuyOrder(userId);
                        } else {
                            console.warn(`[AUTOBOT] No hay suficiente USDT para la primera orden para ${userId}. Necesario: ${currentUserBotState.purchaseAmount} USDT (mínimo ${MIN_USDT_VALUE_FOR_BITMART}), Disponible: ${availableUSDT.toFixed(2)} USDT. Cambiando a NO_COVERAGE.`);
                            currentUserBotState.state = 'NO_COVERAGE';
                            currentUserBotState.nextCoverageUSDTAmount = currentUserBotState.purchaseAmount;
                            currentUserBotState.nextCoverageTargetPrice = currentUserBotState.currentPrice;
                        }
                    } else {
                        console.log(`[AUTOBOT] Esperando una señal de COMPRA de los indicadores para ${userId}.`);
                    }
                }
                break;

            case 'BUYING':
                console.log(`[AUTOBOT] Estado: BUYING para ${userId}. Gestionando compras y coberturas...`);
                console.log(`[AUTOBOT] PPC: ${currentUserBotState.ppc.toFixed(2)}, CP: ${currentUserBotState.cp.toFixed(2)}, AC: ${currentUserBotState.ac.toFixed(8)} ${BASE_CURRENCY}`);
                console.log(`[AUTOBOT] Último precio de orden: ${currentUserBotState.lastOrder ? currentUserBotState.lastOrder.price.toFixed(2) : 'N/A'}`);
                
                if (currentUserBotState.ac > 0) {
                    let nextUSDTAmount;
                    if (currentUserBotState.orderCountInCycle === 0) {
                        nextUSDTAmount = currentUserBotState.purchaseAmount;
                    } else {
                        nextUSDTAmount = currentUserBotState.lastOrderUSDTAmount * (1 + currentUserBotState.incrementPercentage / 100);
                    }

                    const lastOrderPrice = currentUserBotState.lastOrder ? currentUserBotState.lastOrder.price : currentUserBotState.ppc;
                    const nextCoveragePrice = lastOrderPrice * (1 - (currentUserBotState.decrementPercentage / 100));

                    console.log(`[DEBUG_COVERAGE] Próximo monto USDT para ${userId}: ${nextUSDTAmount.toFixed(2)}, Precio de última orden: ${lastOrderPrice.toFixed(2)}, Precio para próxima cobertura: ${nextCoveragePrice.toFixed(2)} ${QUOTE_CURRENCY}.`);

                    if (availableUSDT < nextUSDTAmount || nextUSDTAmount < MIN_USDT_VALUE_FOR_BITMART) {
                        if (currentUserBotState.state !== 'NO_COVERAGE') {
                            console.warn(`[AUTOBOT] Balance insuficiente (${availableUSDT.toFixed(2)} ${QUOTE_CURRENCY}) o monto (${nextUSDTAmount.toFixed(2)} ${QUOTE_CURRENCY}) es menor al mínimo para la próxima orden de cobertura para ${userId}. Cambiando a NO_COVERAGE.`);
                            currentUserBotState.state = 'NO_COVERAGE';
                            currentUserBotState.nextCoverageUSDTAmount = nextUSDTAmount;
                            currentUserBotState.nextCoverageTargetPrice = nextCoveragePrice;
                        }
                    } else if (currentUserBotState.currentPrice <= nextCoveragePrice) {
                        console.log(`[AUTOBOT] Precio de cobertura alcanzado para ${userId}! Intentando colocar orden de cobertura.`);
                        currentUserBotState.nextCoverageUSDTAmount = nextUSDTAmount;
                        currentUserBotState.nextCoverageTargetPrice = nextCoveragePrice;
                        await placeCoverageBuyOrder(userId);
                    } else {
                        console.log(`[AUTOBOT] Esperando precio para próxima cobertura o venta para ${userId}.`);
                    }
                } else if (currentUserBotState.ac === 0 && currentUserBotState.lastOrder && currentUserBotState.lastOrder.side === 'buy' && currentUserBotState.lastOrder.state !== 'filled') {
                    console.log(`[AUTOBOT] Esperando confirmación de la primera orden para ${userId}.`);
                }
                break;

            case 'SELLING':
                console.log(`[AUTOBOT] Estado: SELLING para ${userId}. Gestionando ventas...`);
                if (currentUserBotState.pm === 0 || currentUserBotState.currentPrice > currentUserBotState.pm) {
                    currentUserBotState.pm = currentUserBotState.currentPrice;
                    currentUserBotState.pv = currentUserBotState.pm * (1 - (0.5 / 100)); // 0.5% de caída para precio de venta (PV)
                    currentUserBotState.pc = currentUserBotState.pm * (1 - (0.4 / 100)); // 0.4% de caída para precio de caída (PC)
                }

                // Asegura que el precio de venta (pv) sea siempre mayor que el PPC
                if (currentUserBotState.pv <= currentUserBotState.ppc) {
                    currentUserBotState.pv = currentUserBotState.ppc * 1.003; // Ajusta PV para asegurar al menos un 0.3% de ganancia sobre PPC
                    console.warn(`[AUTOBOT] PV ajustado para ${userId} para asegurar ganancia mínima sobre PPC.`);
                }
                // Asegura que el precio de caída (pc) sea siempre mayor que el PPC
                if (currentUserBotState.pc <= currentUserBotState.ppc) {
                    currentUserBotState.pc = currentUserBotState.ppc * 1.001; // Ajusta PC para proteger el capital (0.1% sobre PPC)
                    console.warn(`[AUTOBOT] PC ajustado para ${userId} para proteger el capital sobre PPC.`);
                }

                if ((currentUserBotState.currentPrice <= currentUserBotState.pc) && currentUserBotState.ac > 0) {
                    console.log(`[AUTOBOT] Condiciones de venta alcanzadas para ${userId}! Colocando orden de venta.`);
                    await placeSellOrder(userId);
                } else {
                    console.log(`[AUTOBOT] Esperando condiciones para la venta para ${userId}. Precio actual: ${currentUserBotState.currentPrice.toFixed(2)}, PM: ${currentUserBotState.pm.toFixed(2)}, PV: ${currentUserBotState.pv.toFixed(2)}, PC: ${currentUserBotState.pc.toFixed(2)}, PPC: ${currentUserBotState.ppc.toFixed(2)}`);
                }
                break;

            case 'NO_COVERAGE':
                console.log(`[AUTOBOT] Estado: NO_COVERAGE para ${userId}. Esperando fondos para la próxima orden de ${currentUserBotState.nextCoverageUSDTAmount.toFixed(2)} ${QUOTE_CURRENCY} @ ${currentUserBotState.nextCoverageTargetPrice.toFixed(2)}.`);
                if (availableUSDT >= currentUserBotState.nextCoverageUSDTAmount && currentUserBotState.nextCoverageUSDTAmount >= MIN_USDT_VALUE_FOR_BITMART) {
                    console.log(`[AUTOBOT] Fondos disponibles para ${userId}. Volviendo a estado BUYING para intentar la orden de cobertura.`);
                    currentUserBotState.state = 'BUYING';
                }
                break;

            case 'ERROR':
                console.error(`[AUTOBOT] Estado: ERROR para ${userId}. El bot ha encontrado un error crítico.`);
                break;

            case 'STOPPED':
                console.log(`[AUTOBOT] Estado: STOPPED para ${userId}. El bot está inactivo.`);
                break;

            default:
                console.warn(`[AUTOBOT] Estado desconocido del bot para ${userId}: ${currentUserBotState.state}. Estableciendo a STOPPED.`);
                currentUserBotState.state = 'STOPPED';
                break;
        }
    } catch (error) {
        console.error(`[AUTOBOT] Excepción en runBotLogic para el usuario ${userId}:`, error.message);
        // Si hay un error inesperado, marca el estado como ERROR
        if (currentUserBotState) {
             currentUserBotState.state = 'ERROR';
             await saveBotStateForUser(userId, currentUserBotState);
        }
    } finally {
        // Guarda el estado del bot después de cada ejecución de la lógica, si no está detenido permanentemente
        if (currentUserBotState && currentUserBotState.state !== 'STOPPED' && currentUserBotState.state !== 'ERROR') {
            await saveBotStateForUser(userId, currentUserBotState);
        }
        // Emite el estado actual del bot al frontend (solo al usuario relevante)
        if (ioInstance && currentUserBotState) {
            ioInstance.to(userId).emit('botStateUpdate', currentUserBotState);
        }
    }
}

// --- Funciones para iniciar/detener el bot para un userId ---
async function startBotStrategy(userId, params) {
    let currentUserBotState = await getBotStateForUser(userId);

    // Si el bot ya está activo, no lo inicies de nuevo.
    if (currentUserBotState.state !== 'STOPPED' && currentUserBotState.state !== 'NO_COVERAGE' && userBotIntervals[userId]) {
        console.warn(`[AUTOBOT] Intento de iniciar bot ya en estado: ${currentUserBotState.state} para el usuario ${userId}.`);
        if (ioInstance) ioInstance.to(userId).emit('botStateUpdate', currentUserBotState);
        return { success: false, message: `Bot is already ${currentUserBotState.state}.`, botState: currentUserBotState };
    }

    console.log(`[AUTOBOT] Iniciando estrategia del bot para el usuario ${userId}...`);
    Object.assign(currentUserBotState, params); // Actualiza los parámetros con los recibidos
    currentUserBotState.state = 'RUNNING';
    currentUserBotState.cycle = 0; // Reiniciar ciclos al iniciar
    currentUserBotState.profit = 0; // Reiniciar ganancias al iniciar
    await resetCycleVariables(userId); // Asegura que las variables del ciclo estén limpias en DB

    // Limpiar cualquier intervalo anterior si existe para este usuario
    if (userBotIntervals[userId]) {
        clearInterval(userBotIntervals[userId]);
        userBotIntervals[userId] = null;
    }

    // Iniciar el loop principal de la lógica del bot para este usuario
    // Cada 5 segundos (ajusta según tus necesidades)
    userBotIntervals[userId] = setInterval(() => runBotLogicForUser(userId), 5000);
    console.log(`[AUTOBOT] Loop de estrategia iniciado para el usuario ${userId}.`);

    await saveBotStateForUser(userId, currentUserBotState);
    if (ioInstance) ioInstance.to(userId).emit('botStateUpdate', currentUserBotState);
    return { success: true, message: 'Bot strategy started.', botState: currentUserBotState };
}

async function stopBotStrategy(userId) {
    let currentUserBotState = await getBotStateForUser(userId);

    if (userBotIntervals[userId]) {
        console.log(`[AUTOBOT] Deteniendo la estrategia del bot para el usuario ${userId}.`);
        clearInterval(userBotIntervals[userId]);
        userBotIntervals[userId] = null;
    }
    currentUserBotState.state = 'STOPPED';
    // Asegurarse de cancelar órdenes abiertas al detener el bot
    // Pasa userId a cancelOpenOrders
    await cancelOpenOrders(userId, TRADE_SYMBOL); 
    await saveBotStateForUser(userId, currentUserBotState);
    if (ioInstance) ioInstance.to(userId).emit('botStateUpdate', currentUserBotState);
    return { success: true, message: 'Bot strategy stopped.', botState: currentUserBotState };
}

// --- Exportaciones ---
module.exports = {
    botState, // Mantener para el estado global/default
    setIoInstance,
    loadBotStateFromDB, // Carga el estado global/default al inicio del server
    getBotStateForUser, // NUEVO: Para obtener el estado de un usuario específico
    saveBotStateForUser, // NUEVO: Para guardar el estado de un usuario específico
    startBotStrategy,
    stopBotStrategy,
    runBotLogicForUser // Exportar si necesitas llamarla directamente para un usuario
};
