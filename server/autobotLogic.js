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
// IMPORTANTE: Si tu aplicación maneja múltiples usuarios con sus propios bots,
// este ID debería ser asignado dinámicamente o venir de una variable de entorno.
// Por ahora, para que el bot arranque, usamos uno de prueba.
// Si ya tienes usuarios registrados, puedes usar un _id real de un usuario de tu DB aquí.
const DEFAULT_BOT_USER_ID = process.env.BOT_USER_ID || 'un_id_de_usuario_para_el_bot';


// --- ESTADO GLOBAL DEL BOT ---
// Este objeto será gestionado por las funciones del bot y guardado/cargado de la DB.
// Se inicializa con valores por defecto.
let botState = {
    userId: DEFAULT_BOT_USER_ID, // <-- ¡Añadido! Asegura que el ID de usuario se guarda
    state: 'STOPPED', // <-- ¡Cambiado de 'status' a 'state' para coincidir con el modelo!
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
    strategyIntervalId: null, // Para manejar el setInterval
    orderCountInCycle: 0, // Nuevo: Contador de órdenes en el ciclo actual
    lastOrderUSDTAmount: 0, // Nuevo: Monto en USDT de la última orden
    nextCoverageUSDTAmount: 0, // Nuevo: Monto para la próxima orden de cobertura
    nextCoverageTargetPrice: 0, // Nuevo: Precio objetivo para la próxima orden de cobertura
    stopOnCycleEnd: false // NUEVO: Bandera para detener al final del ciclo
};

// Referencia global para Socket.IO (se inyectará desde server.js)
let ioInstance;

// Función para inyectar la instancia de Socket.IO
function setIoInstance(io) {
    ioInstance = io;
    console.log('[AUTOBOT] Socket.IO instance attached to autobotLogic.');
}

// Guarda el estado actual del bot en la base de datos
async function saveBotStateToDB() {
    try {
        // Asegúrate de no guardar strategyIntervalId en la DB
        const stateToSave = { ...botState };
        delete stateToSave.strategyIntervalId;

        await BotState.findOneAndUpdate(
            { userId: DEFAULT_BOT_USER_ID }, // <-- ¡Añadido! Busca por el userId
            stateToSave,
            { upsert: true, new: true, setDefaultsOnInsert: true } // Create if not exists, return new doc
        );
        console.log('[DB] Estado del bot guardado.');
    } catch (error) {
        console.error('❌ Error guardando estado del bot en DB:', error.message);
    }
}

// Carga el estado del bot desde la base de datos al inicio
async function loadBotStateFromDB() {
    try {
        // Busca el estado del bot para el userId predefinido
        const savedState = await BotState.findOne({ userId: DEFAULT_BOT_USER_ID }); // <-- ¡Cambio aquí!
        if (savedState) {
            Object.assign(botState, savedState.toObject()); // Merge saved state into current botState
            console.log('[DB] Estado de bot cargado desde la base de datos.');

            // Al cargar, siempre aseguramos que el intervalo no esté corriendo.
            // Si el bot estaba en RUNNING antes de un reinicio, lo ponemos en STOPPED
            // para que el usuario lo inicie manualmente.
            if (botState.strategyIntervalId) {
                clearInterval(botState.strategyIntervalId);
                botState.strategyIntervalId = null;
            }
            // Si el bot se carga y tiene activo comprado (AC > 0), pero está en RUNNING,
            // lo movemos a BUYING inmediatamente para que la lógica de gestión de ciclo continúe.
            if (botState.state === 'RUNNING' && botState.ac > 0) {
                console.warn('[DB] Bot cargado en estado RUNNING con AC > 0. Transicionando a BUYING.');
                botState.state = 'BUYING';
            } else if (botState.state !== 'STOPPED') {
                // Si estaba en cualquier otro estado que no sea STOPPED, lo ponemos en STOPPED al cargar
                console.warn(`[DB] Bot estaba en estado ${botState.state}. Se ha reiniciado en STOPPED. Por favor, inícielo manualmente.`);
                botState.state = 'STOPPED';
            }
            if (ioInstance) {
                ioInstance.emit('botStateUpdate', botState); // Emitir el estado inicial al cargar
            }
        } else {
            console.log('[DB] No hay estado de bot guardado. Iniciando con estado por defecto.');
            // Si no hay estado guardado, guarda el estado inicial (que ahora tiene userId y state)
            const initialBotState = new BotState(botState);
            await initialBotState.save();
            console.log('[DB] Nuevo estado de bot por defecto guardado.');
            if (ioInstance) {
                ioInstance.emit('botStateUpdate', botState);
            }
        }
    } catch (error) {
        console.error('❌ Error cargando estado del bot desde DB:', error.message);
    }
}

// --- Función para resetear las variables del ciclo ---
function resetCycleVariables() {
    console.log('[AUTOBOT] Reseteando variables del ciclo.');
    botState.ppc = 0;
    botState.cp = 0;
    botState.ac = 0;
    botState.pm = 0;
    botState.pv = 0;
    botState.pc = 0;
    botState.lastOrder = null;
    botState.openOrders = [];
    botState.cycleProfit = 0; // También resetear la ganancia del ciclo
    botState.orderCountInCycle = 0; // Resetear
    botState.lastOrderUSDTAmount = 0; // Resetear
    botState.nextCoverageUSDTAmount = 0;
    botState.nextCoverageTargetPrice = 0;
}

// --- Función para cancelar órdenes abiertas ---
async function cancelOpenOrders(symbol) {
    console.log(`[AUTOBOT] Intentando cancelar todas las órdenes abiertas para ${symbol}...`);
    try {
        const openOrders = await bitmartService.getOpenOrders(symbol);
        if (openOrders && openOrders.orders && openOrders.orders.length > 0) {
            for (const order of openOrders.orders) {
                console.log(`[AUTOBOT] Cancelando orden: ${order.order_id} (Side: ${order.side}, Type: ${order.order_type}, Price: ${order.price}, Size: ${order.size})`);
                await bitmartService.cancelOrder(symbol, order.order_id);
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
async function placeFirstBuyOrder() {
    console.log(`[AUTOBOT] Intentando colocar la primera orden de compra (CICLO ${botState.cycle})...`);
    const tradeSymbol = TRADE_SYMBOL;
    const orderType = 'market';
    const side = 'buy';
    
    const sizeUSDT = botState.purchaseAmount; 
    console.log(`[DEBUG_ORDER] Tamaño de compra en USDT (purchaseAmount): ${sizeUSDT} USDT.`);

    // Obtener balance y precio actual para asegurar la compra
    const balanceInfo = await bitmartService.getBalance();
    const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;

    console.log(`[DEBUG_ORDER] Balance USDT disponible: ${availableUSDT.toFixed(2)} USDT.`);
    if (availableUSDT < sizeUSDT) {
        console.warn(`[AUTOBOT] Balance insuficiente para la primera orden. Necesario: ${sizeUSDT} USDT, Disponible: ${availableUSDT.toFixed(2)} USDT.`);
        botState.state = 'NO_COVERAGE'; // <-- ¡Cambiado de 'status' a 'state'!
        return;
    }
    if (botState.currentPrice === 0) {
        console.error('[AUTOBOT] Precio actual no disponible para la primera orden. Reintentando...');
        botState.state = 'RUNNING'; // <-- ¡Cambiado de 'status' a 'state'!
        return;
    }

    let sizeBTC = sizeUSDT / botState.currentPrice;
    sizeBTC = parseFloat(sizeBTC.toFixed(8)); // Redondear a 8 decimales para BTC
    console.log(`[DEBUG_ORDER] Tamaño calculado en BTC: ${sizeBTC} ${TRADE_SYMBOL.split('_')[0]}.`);

    if (sizeUSDT < MIN_USDT_VALUE_FOR_BITMART) {
        console.error(`[AUTOBOT] El valor de la orden (${sizeUSDT} USDT) es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART} USDT). Ajusta tu PURCHASE.`);
        botState.state = 'STOPPED'; // <-- ¡Cambiado de 'status' a 'state'!
        return;
    }
    try {
        console.log(`[AUTOBOT] Colocando orden de COMPRA (MARKET): ${sizeBTC.toFixed(8)} ${TRADE_SYMBOL.split('_')[0]} por ${sizeUSDT.toFixed(2)} USDT a precio de ${botState.currentPrice.toFixed(2)} USDT.`);
        
        const orderResult = await bitmartService.placeOrder(tradeSymbol, side, orderType, sizeUSDT.toString()); // <<-- ¡Línea activa para operación real!
        
        console.log('[DEBUG_ORDER] Resultado de la primera orden de compra:', orderResult);

        if (orderResult && orderResult.order_id) {
            botState.lastOrder = {
                orderId: orderResult.order_id,
                price: botState.currentPrice, // El precio de ejecución real puede variar un poco en MARKET
                size: sizeBTC, // Esto es el tamaño aproximado en BTC que esperamos obtener
                side: 'buy',
                type: 'market',
                state: 'new'
            };
            botState.openOrders.push(botState.lastOrder); // Añadir a las órdenes abiertas del bot

            console.log(`[AUTOBOT] Primera orden colocada: ID ${orderResult.order_id}. Monitoreando...`);

            // Espera simulada para que la orden se procese en el exchange.
            await new Promise(resolve => setTimeout(resolve, 2000)); 

            // Obtén los detalles reales de la orden ejecutada desde BitMart.
            const filledOrder = await bitmartService.getOrderDetail(TRADE_SYMBOL, orderResult.order_id);

            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price); // Precio real al que se llenó la orden
                const actualSize = parseFloat(filledOrder.filled_size); // Cantidad real de BTC comprada
                const actualAmountUSD = actualPrice * actualSize; // Monto real en USDT gastado

                botState.ppc = actualPrice; // Precio promedio de compra (para la primera compra)
                botState.cp = actualAmountUSD; // Costo promedio (en USDT)
                botState.ac = actualSize; // Cantidad acumulada (en BTC)
                botState.cycle = 1; // Primer ciclo iniciado
                botState.orderCountInCycle = 1; // Esta es la primera orden del ciclo
                botState.lastOrderUSDTAmount = actualAmountUSD; // Guardar el monto gastado en USDT

                // Quita la orden de la lista de órdenes abiertas del bot (ya está llena)
                botState.openOrders = botState.openOrders.filter(o => o.orderId !== orderResult.order_id);

                console.log(`[AUTOBOT] Primera orden de compra COMPLETA. PPC: ${botState.ppc.toFixed(2)}, CP: ${botState.cp.toFixed(2)}, AC: ${botState.ac.toFixed(5)} ${TRADE_SYMBOL.split('_')[0]}. Órdenes en ciclo: ${botState.orderCountInCycle}`);
                botState.state = 'BUYING'; // <-- ¡Cambiado de 'status' a 'state'! Cambia el estado a 'BUYING' para que el bot empiece a gestionar futuras compras/ventas
            } else {
                console.warn(`[AUTOBOT] La primera orden ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
                botState.state = 'RUNNING'; // <-- ¡Cambiado de 'status' a 'state'! Reintentar buscar punto de entrada
            }

        } else {
            console.error('[AUTOBOT] Error al colocar la primera orden: No se recibió order_id o la respuesta es inválida.');
            botState.state = 'RUNNING'; // <-- ¡Cambiado de 'status' a 'state'! Reintentar buscar punto de entrada
        }
    } catch (error) {
        console.error('[AUTOBOT] Excepción al colocar la primera orden:', error.message);
        botState.state = 'RUNNING'; // <-- ¡Cambiado de 'status' a 'state'! Reintentar buscar punto de entrada
    }
}

async function placeCoverageBuyOrder() {
    console.log(`[AUTOBOT] Intentando colocar orden de compra de COBERTURA (CICLO ${botState.cycle})...`);
    const tradeSymbol = TRADE_SYMBOL;
    const side = 'buy';
    const orderType = 'limit'; // Las órdenes de cobertura suelen ser LIMIT para controlar el precio
    const sizeUSDT = botState.nextCoverageUSDTAmount; // Usar el monto calculado en runBotLogic
    const targetPrice = botState.nextCoverageTargetPrice; // Usar el precio calculado en runBotLogic

    // Obtener balance y precio actual (ya se hizo en runBotLogic, pero re-verificar por si acaso)
    const balanceInfo = await bitmartService.getBalance();
    const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
    const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;

    if (availableUSDT < sizeUSDT || sizeUSDT < MIN_USDT_VALUE_FOR_BITMART) {
        console.warn(`[AUTOBOT] Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto de orden (${sizeUSDT.toFixed(2)} USDT) es menor al mínimo para orden de cobertura. Cambiando a NO_COVERAGE.`);
        botState.state = 'NO_COVERAGE'; // <-- ¡Cambiado de 'status' a 'state'!
        return;
    }

    if (botState.currentPrice === 0) {
        console.error('[AUTOBOT] Precio actual no disponible para orden de cobertura.');
        return;
    }

    let sizeBTC = sizeUSDT / targetPrice;
    sizeBTC = parseFloat(sizeBTC.toFixed(8)); // Redondear a 8 decimales para BTC

    try {
        console.log(`[AUTOBOT] Colocando orden de COMPRA (LIMIT) de cobertura: ${sizeBTC.toFixed(8)} ${TRADE_SYMBOL.split('_')[0]} a ${targetPrice.toFixed(2)} USDT.`);
        const orderResult = await bitmartService.placeOrder(tradeSymbol, side, orderType, sizeUSDT.toString(), targetPrice.toFixed(2)); // REAL

        console.log('[AUTOBOT] Resultado de la orden de cobertura:', orderResult);

        if (orderResult && orderResult.order_id) {
            const newOrder = {
                orderId: orderResult.order_id,
                price: targetPrice,
                size: sizeBTC,
                side: 'buy',
                type: 'limit',
                state: 'new' // o 'open'
            };
            botState.openOrders.push(newOrder);
            console.log(`[AUTOBOT] Orden de cobertura colocada: ID ${orderResult.order_id}. Monitoreando...`);
            
            const filledOrder = await bitmartService.getOrderDetail(TRADE_SYMBOL, orderResult.order_id);

            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price);
                const actualSize = parseFloat(filledOrder.filled_size);
                const actualAmountUSD = actualPrice * actualSize;

                // Actualizar PPC, CP, AC
                botState.ac += actualSize; // Suma el BTC de esta orden
                botState.cp += actualAmountUSD; // Suma el USDT gastado en esta orden
                botState.ppc = botState.cp / botState.ac; // Recalcular Precio Promedio de Compra
                botState.orderCountInCycle++; // Incrementa el contador de órdenes en el ciclo
                botState.lastOrderUSDTAmount = actualAmountUSD; // Guarda el monto de esta orden

                botState.lastOrder = { // Actualizar lastOrder para la próxima iteración
                    orderId: orderResult.order_id,
                    price: actualPrice,
                    size: actualSize,
                    side: side,
                    type: 'limit',
                    state: 'filled'
                };
                botState.openOrders = botState.openOrders.filter(o => o.orderId !== orderResult.order_id); // Eliminar de órdenes abiertas

                console.log(`[AUTOBOT] Orden de cobertura COMPLETA. Nuevo AC: ${botState.ac.toFixed(8)}, Nuevo CP: ${botState.cp.toFixed(2)}, Nuevo PPC: ${botState.ppc.toFixed(2)}. Ordenes en ciclo: ${botState.orderCountInCycle}`);
                // botState.state permanece en 'BUYING'
            } else {
                console.warn(`[AUTOBOT] La orden de cobertura ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
                // Podrías dejar la orden en openOrders y esperar su llenado en el próximo ciclo
            }

        } else {
            console.error('[AUTOBOT] Error al colocar orden de cobertura: No se recibió order_id o la respuesta es inválida.');
        }
    } catch (error) {
        console.error('[AUTOBOT] Excepción al colocar orden de cobertura:', error.message);
    }
}

async function placeSellOrder() {
    console.log(`[AUTOBOT] Intentando colocar orden de VENTA (CICLO ${botState.cycle})...`);
    const tradeSymbol = TRADE_SYMBOL;
    const side = 'sell';
    const orderType = 'market'; // Generalmente se vende a mercado para asegurar la salida
    let sizeBTC = botState.ac; // Vender todo el activo acumulado

    if (botState.ac <= 0) {
        console.warn('[AUTOBOT] No hay activo para vender (AC = 0).');
        botState.state = 'RUNNING'; // <-- ¡Cambiado de 'status' a 'state'! Volver a RUNNING para buscar nueva entrada
        return;
    }

    try {
        console.log(`[AUTOBOT] Colocando orden de VENTA (MARKET): ${sizeBTC.toFixed(8)} ${TRADE_SYMBOL.split('_')[0]} a precio de ${botState.currentPrice.toFixed(2)} USDT.`);
        // **IMPORTANTE: PARA COLOCAR ÓRDENES REALES, DESCOMENTA LA SIGUIENTE LÍNEA Y COMENTA LA SIMULACIÓN.**
        const orderResult = await bitmartService.placeOrder(tradeSymbol, side, orderType, sizeBTC.toString()); // REAL
        
        console.log('[DEBUG_ORDER] Resultado de la orden de venta:', orderResult);

        if (orderResult && orderResult.order_id) {
            console.log(`[AUTOBOT] Orden de VENTA colocada con éxito. ID de orden: ${orderResult.order_id}`);

            await cancelOpenOrders(TRADE_SYMBOL); // Cancelar órdenes de compra pendientes

            // Obtén los detalles reales de la orden ejecutada desde BitMart.
            const filledOrder = await bitmartService.getOrderDetail(TRADE_SYMBOL, orderResult.order_id);
            
            if (filledOrder && (filledOrder.state === 'filled' || filledOrder.state === 'fully_filled')) {
                const actualPrice = parseFloat(filledOrder.price);
                const actualSize = parseFloat(filledOrder.filled_size); // Usar filled_size, no sfilled_size
                const revenueFromSale = actualPrice * actualSize; // Ingresos de la venta (USDT)
                const commissionRate = 0.001; // 0.1% (Tasa de comisión de ejemplo, ajusta según BitMart)
                const buyCommission = botState.cp * commissionRate;
                const sellCommission = revenueFromSale * commissionRate;

                botState.cycleProfit = revenueFromSale - botState.cp - buyCommission - sellCommission;
                botState.profit += botState.cycleProfit;

                console.log(`[AUTOBOT] Ciclo ${botState.cycle} completado. Ganancia/Pérdida del ciclo: ${botState.cycleProfit.toFixed(2)} USDT. Ganancia total: ${botState.profit.toFixed(2)} USDT.`);

                // LÓGICA DE DETENCIÓN POR 'STOP ON CYCLE END'
                if (botState.stopOnCycleEnd) {
                    console.log('[AUTOBOT] Bandera "Stop on Cycle End" activada. Deteniendo el bot al final del ciclo.');
                    await stopBotStrategy(); // Llama a la función de detención completa
                    return; // Salir después de detener el bot
                }

                resetCycleVariables(); // Resetear variables para el nuevo ciclo
                botState.cycle++; // Incrementar el ciclo para el nuevo inicio
                botState.state = 'RUNNING'; // <-- ¡Cambiado de 'status' a 'state'! Volver a RUNNING para que espere la nueva señal de COMPRA
                console.log('[AUTOBOT] Bot listo para el nuevo ciclo en estado RUNNING, esperando próxima señal de COMPRA.');

            } else {
                console.warn(`[AUTOBOT] La orden de venta ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
            }

        } else {
            console.error('[AUTOBOT] Error al colocar la orden de venta: No se recibió order_id o la respuesta es inválida.', orderResult);
        }
    } catch (error) {
        console.error('[AUTOBOT] Excepción al colocar la orden de venta:', error.message);
    }
}


// --- Función Principal de Lógica del Bot ---
async function runBotLogic() {
    console.log(`\n--- Ejecutando lógica del bot. Estado actual: ${botState.state} ---`); // <-- ¡Cambiado de 'status' a 'state'!

    try {
        // Siempre obtén el precio actual al inicio de cada ejecución del loop
        const ticker = await bitmartService.getTicker(TRADE_SYMBOL);
        if (ticker && ticker.last) {
            botState.currentPrice = parseFloat(ticker.last);
            console.log(`[AUTOBOT] Precio actual de BitMart actualizado: ${botState.currentPrice.toFixed(2)} USDT`);
        } else {
            console.warn('[AUTOBOT] No se pudo obtener el precio actual. Reintentando...');
            return; // Salir si no hay precio, para evitar errores en cálculos
        }

        // Obtener balance actualizado al inicio de cada ciclo para NO_COVERAGE y otras validaciones
        const balanceInfo = await bitmartService.getBalance();
        const usdtBalance = balanceInfo.find(b => b.currency === 'USDT');
        const availableUSDT = usdtBalance ? parseFloat(usdtBalance.available) : 0;
        const btcBalance = balanceInfo.find(b => b.currency === 'BTC');
        const availableBTC = btcBalance ? parseFloat(btcBalance.available) : 0;

        // Emit balance update
        if (ioInstance) {
            ioInstance.emit('balanceUpdate', { usdt: availableUSDT, btc: availableBTC });
        }

        // **LÓGICA DE VENTA PRIORITARIA (GLOBAL)**
        // Si tenemos activos comprados (botState.ac > 0)
        // Y el bot NO está actualmente en SELLING (para evitar re-evaluar la venta en el mismo ciclo si ya está vendiendo)
        // Y el precio actual alcanza o supera el precio esperado de venta (calculado con triggerPercentage)
        const expectedSellPrice = botState.ppc * (1 + botState.triggerPercentage / 100);
        if (botState.ac > 0 && botState.currentPrice >= expectedSellPrice && botState.state !== 'SELLING') {
            console.log(`[AUTOBOT] ¡PRECIO DE VENTA GLOBAL ALCANZADO! (${botState.currentPrice.toFixed(2)} >= ${expectedSellPrice.toFixed(2)})`);
            console.log('[AUTOBOT] Transicionando a SELLING para ejecutar la estrategia de venta.');
            botState.state = 'SELLING';
            // Importante: No ponemos un 'return' aquí. Queremos que el switch-case se ejecute
            // y que el estado 'SELLING' maneje el resto de la lógica de venta en este mismo ciclo.
        }

        switch (botState.state) { // <-- ¡Cambiado de 'status' a 'state'!
            case 'RUNNING':
                console.log('[AUTOBOT] Estado: RUNNING. Esperando señal de entrada de COMPRA desde el analizador de indicadores...');

                // **NUEVA LÓGICA: Si estamos en RUNNING y AC > 0, es un estado inconsistente.**
                // Esto puede pasar si se carga un estado previo con AC > 0 y el bot se inicia en RUNNING.
                // En este caso, el bot debería estar en BUYING o SELLING.
                // Lo movemos a BUYING para que la lógica de ciclo continúe.
                if (botState.ac > 0) {
                    console.warn('[AUTOBOT] Detectado AC > 0 en estado RUNNING. Transicionando a BUYING para reanudar ciclo.');
                    botState.state = 'BUYING';
                    // No hacemos 'break' aquí, permitimos que la lógica del nuevo estado 'BUYING' se ejecute inmediatamente.
                } else {
                    // *** INTEGRACIÓN CON bitmart_indicator_analyzer.js (Solo si AC === 0) ***
                    const analysisResult = await bitmartIndicatorAnalyzer.runAnalysis();
                    console.log(`[AUTOBOT] Analizador de indicadores resultado: ${analysisResult.action} - Razón: ${analysisResult.reason}`);

                    // Si el analizador indica una señal de COMPRA y aún no hemos comprado en este ciclo (ac === 0)
                    if (analysisResult.action === 'COMPRA') { // No necesitamos '&& botState.ac === 0' aquí porque ya lo manejamos arriba.
                        console.log('[AUTOBOT] ¡Señal de entrada de COMPRA DETECTADA por los indicadores!');
                        // Antes de transicionar a BUYING, aseguramos que haya capital para la primera compra
                        if (availableUSDT >= botState.purchaseAmount && botState.purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART) {
                            botState.state = 'BUYING'; // Transicionar a BUYING para la primera compra
                            await placeFirstBuyOrder(); // Intentar colocar la primera orden
                        } else {
                            console.warn(`[AUTOBOT] No hay suficiente USDT para la primera orden. Necesario: ${botState.purchaseAmount} USDT (mínimo ${MIN_USDT_VALUE_FOR_BITMART}), Disponible: ${availableUSDT.toFixed(2)} USDT. Cambiando a NO_COVERAGE.`);
                            botState.state = 'NO_COVERAGE';
                            botState.nextCoverageUSDTAmount = botState.purchaseAmount; // Establecer para NO_COVERAGE
                            botState.nextCoverageTargetPrice = botState.currentPrice; // Establecer para NO_COVERAGE
                        }
                    } else {
                        console.log('[AUTOBOT] Esperando una señal de COMPRA de los indicadores.');
                    }
                }
                break; // Terminamos el caso RUNNING (o caemos directamente en el siguiente caso si el estado cambió)

            case 'BUYING':
                console.log('[AUTOBOT] Estado: BUYING. Gestionando compras y coberturas...');
                console.log(`[AUTOBOT] PPC: ${botState.ppc.toFixed(2)}, CP: ${botState.cp.toFixed(2)}, AC: ${botState.ac.toFixed(8)} BTC`);
                console.log(`[AUTOBOT] Último precio de orden: ${botState.lastOrder ? botState.lastOrder.price.toFixed(2) : 'N/A'}`);
                
                // La lógica de transición a SELLING por TRIGGER ya fue movida fuera del switch,
                // por lo que este caso no necesita manejarla directamente.

                // Lógica para órdenes de cobertura (si el precio cae)
                if (botState.ac > 0) { // Solo busca cobertura si ya tenemos activo comprado
                    let nextUSDTAmount;
                    if (botState.orderCountInCycle === 0) {
                        // Si ac > 0 pero orderCountInCycle es 0, significa que es la primera orden que se está procesando
                        // o un estado inconsistente. Asumimos que la primera orden ya se colocó y usamos purchaseAmount.
                        nextUSDTAmount = botState.purchaseAmount; 
                    } else {
                        nextUSDTAmount = botState.lastOrderUSDTAmount * (1 + botState.incrementPercentage / 100);
                    }

                    // Calcular Precio_Limite_Orden_N para la orden de cobertura
                    const lastOrderPrice = botState.lastOrder ? botState.lastOrder.price : botState.ppc; // Base para el cálculo del decrecimiento
                    const nextCoveragePrice = lastOrderPrice * (1 - (botState.decrementPercentage / 100));

                    console.log(`[DEBUG_COVERAGE] Próximo monto USDT: ${nextUSDTAmount.toFixed(2)}, Precio de última orden: ${lastOrderPrice.toFixed(2)}, Precio para próxima cobertura: ${nextCoveragePrice.toFixed(2)} USDT.`);

                    // --- Lógica de Transición a NO_COVERAGE O Colocación de Orden de Cobertura ---
                    if (availableUSDT < nextUSDTAmount || nextUSDTAmount < MIN_USDT_VALUE_FOR_BITMART) {
                        if (botState.state !== 'NO_COVERAGE') { 
                            console.warn(`[AUTOBOT] Balance insuficiente (${availableUSDT.toFixed(2)} USDT) o monto (${nextUSDTAmount.toFixed(2)} USDT) es menor al mínimo para la próxima orden de cobertura. Cambiando a NO_COVERAGE.`);
                            botState.state = 'NO_COVERAGE';
                            botState.nextCoverageUSDTAmount = nextUSDTAmount; // Guardar para cuando se recupere el balance
                            botState.nextCoverageTargetPrice = nextCoveragePrice;
                        }
                    } else if (botState.currentPrice <= nextCoveragePrice) {
                        console.log('[AUTOBOT] Precio de cobertura alcanzado! Intentando colocar orden de cobertura.');
                        botState.nextCoverageUSDTAmount = nextUSDTAmount; // Para que placeCoverageBuyOrder lo use
                        botState.nextCoverageTargetPrice = nextCoveragePrice; // Para que placeCoverageBuyOrder lo use
                        await placeCoverageBuyOrder();
                    } else {
                        console.log('[AUTOBOT] Esperando precio para próxima cobertura o venta.');
                    }
                } else if (botState.ac === 0 && botState.lastOrder && botState.lastOrder.side === 'buy' && botState.lastOrder.state !== 'filled') {
                    console.log('[AUTOBOT] Esperando confirmación de la primera orden o actualización de AC (puede que la primera orden esté pendiente).');
                }
                break;

            case 'SELLING':
                console.log('[AUTOBOT] Estado: SELLING. Gestionando ventas...');
                // Si el precio actual es mayor que el precio máximo registrado (botState.pm), actualiza pm.
                // Esto es para asegurar que el pm siempre represente el precio más alto alcanzado desde la última compra.
                if (botState.pm === 0 || botState.currentPrice > botState.pm) {
                    botState.pm = botState.currentPrice;
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
function setIoInstance(io) {
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
                side: 'buy',
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
                const actualSize = parseFloat(filledOrder.filled_size);
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
        const expectedSellPrice = botStateObj.ppc * (1 + botStateObj.triggerPercentage / 100);
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
                    const analysisResult = await bitmartIndicatorAnalyzer.runAnalysis();
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
                        nextUSDTAmount = botStateObj.lastOrderUSDTAmount * (1 + botStateObj.incrementPercentage / 100);
                    }
                    
                    const lastOrderPrice = botStateObj.lastOrder ? botStateObj.lastOrder.price : botStateObj.ppc;
                    const nextCoveragePrice = lastOrderPrice * (1 - (botStateObj.decrementPercentage / 100));

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
    } catch (error) {
        console.error(`[AUTOBOT][${botStateObj.userId}] Excepción en runBotLogic:`, error.message);
    } finally {
        // Guarda el estado del bot después de cada ejecución de la lógica, si está activo
        if (botStateObj.state !== 'STOPPED') {
            await saveBotState(botStateObj);
        }
        // Emitir el estado actual del bot al frontend después de cada ciclo
        if (ioInstance) {
            ioInstance.emit('botStateUpdate', botStateObj); // Emitir el estado específico del usuario
        }
    }
}

/**
 * Inicia la estrategia del bot para un usuario.
 * @param {string} userId - El ID del usuario.
 * @param {Object} params - Parámetros de configuración iniciales (purchase, increment, decrement, trigger, stopAtCycleEnd).
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 * @returns {Object} Un objeto con éxito y el estado del bot.
 */
async function startBotStrategy(userId, params, bitmartCreds) {
    const botState = await loadBotStateForUser(userId); // Carga el estado del bot para este usuario

    if (botState.state !== 'STOPPED' && botState.state !== 'NO_COVERAGE') {
        console.warn(`[AUTOBOT][${userId}] Intento de iniciar bot ya en estado: ${botState.state}.`);
        if (ioInstance) {
            ioInstance.emit('botStateUpdate', botState);
        }
        return { success: false, message: `Bot is already ${botState.state}.`, botState: { ...botState.toObject() } };
    }

    console.log(`[AUTOBOT][${userId}] Iniciando estrategia del bot...`);
    
    // Actualiza los parámetros de configuración en el objeto del estado del bot
    Object.assign(botState, {
        purchase: parseFloat(params.purchase),
        increment: parseFloat(params.increment),
        decrement: parseFloat(params.decrement),
        trigger: parseFloat(params.trigger),
        stopAtCycleEnd: typeof params.stopAtCycleEnd === 'boolean' ? params.stopAtCycleEnd : false
    });

    // Reiniciar o establecer los estados iniciales del ciclo si se inicia el bot
    Object.assign(botState, {
        state: 'RUNNING', // Inicializa en RUNNING para buscar la primera señal
        cycle: 0, // Reiniciar ciclos al iniciar
        profit: 0, // Reiniciar ganancias al iniciar
        // Otros campos que necesiten ser reseteados al inicio completo del bot
        ppc: 0, cp: 0, ac: 0, pm: 0, pv: 0, pc: 0, lastOrder: null, openOrders: [], cycleProfit: 0,
        orderCountInCycle: 0, lastOrderUSDTAmount: 0, nextCoverageUSDTAmount: 0, nextCoverageTargetPrice: 0
    });

    // Limpiar cualquier intervalo anterior si existe (por seguridad)
    if (botState.strategyIntervalId) {
        clearInterval(botState.strategyIntervalId);
    }

    // Iniciar el loop principal de la lógica del bot para este usuario
    // Guardar el ID del intervalo en el objeto del estado del bot (temporal, no se guarda en DB)
    botState.strategyIntervalId = setInterval(() => runBotLogic(botState, bitmartCreds), 5000); // Pasar botState y credenciales
    console.log(`[AUTOBOT][${userId}] Loop de estrategia iniciado.`);

    await saveBotState(botState); // Guarda el estado de RUNNING con los nuevos parámetros
    if (ioInstance) {
        ioInstance.emit('botStateUpdate', botState.toObject());
    }
    return { success: true, message: 'Bot strategy started.', botState: { ...botState.toObject() } };
}

/**
 * Detiene la estrategia del bot para un usuario.
 * @param {Object} botStateObj - El objeto del estado del bot.
 * @param {Object} bitmartCreds - Credenciales de BitMart del usuario.
 * @returns {Object} Un objeto con éxito y el estado del bot.
 */
async function stopBotStrategy(botStateObj, bitmartCreds) {
    if (botStateObj.strategyIntervalId) {
        console.log(`[AUTOBOT][${botStateObj.userId}] Deteniendo la estrategia del bot.`);
        clearInterval(botStateObj.strategyIntervalId);
        botStateObj.strategyIntervalId = null;
    }
    botStateObj.state = 'STOPPED';
    // Asegurarse de cancelar órdenes abiertas al detener el bot
    await cancelOpenOrders(bitmartCreds, TRADE_SYMBOL); // Pasar credenciales
    
    if (ioInstance) {
        ioInstance.emit('botStateUpdate', botStateObj.toObject());
    }
    await saveBotState(botStateObj); // Guarda el estado de STOPPED
    return { success: true, message: 'Bot strategy stopped.', botState: { ...botStateObj.toObject() } };
}

// --- Exportaciones ---
module.exports = {
    setIoInstance,
    loadBotStateForUser, // Exportar para que server.js lo use al cargar el estado por usuario
    saveBotState, // Exportar para que server.js lo use al guardar el estado por usuario
    startBotStrategy,
    stopBotStrategy
    // runBotLogic ya no se exporta directamente, se llama desde el setInterval.
    // botState ya no es global y no se exporta.
};
