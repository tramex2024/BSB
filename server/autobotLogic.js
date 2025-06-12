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
        botState.state = 'NO_COVERAGE';
        return;
    }
    if (botState.currentPrice === 0) {
        console.error('[AUTOBOT] Precio actual no disponible para la primera orden. Reintentando...');
        botState.state = 'RUNNING';
        return;
    }

    let sizeBTC = sizeUSDT / botState.currentPrice;
    sizeBTC = parseFloat(sizeBTC.toFixed(8)); // Redondear a 8 decimales para BTC
    console.log(`[DEBUG_ORDER] Tamaño calculado en BTC: ${sizeBTC} ${TRADE_SYMBOL.split('_')[0]}.`);

    if (sizeUSDT < MIN_USDT_VALUE_FOR_BITMART) {
        console.error(`[AUTOBOT] El valor de la orden (${sizeUSDT} USDT) es menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART} USDT). Ajusta tu PURCHASE.`);
        botState.state = 'STOPPED';
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
                botState.state = 'BUYING'; // Cambia el estado a 'BUYING' para que el bot empiece a gestionar futuras compras/ventas
            } else {
                console.warn(`[AUTOBOT] La primera orden ${orderResult.order_id} no se ha completado todavía o falló. Estado: ${filledOrder ? filledOrder.state : 'Desconocido'}`);
                botState.state = 'RUNNING'; // Reintentar buscar punto de entrada
            }

        } else {
            console.error('[AUTOBOT] Error al colocar la primera orden: No se recibió order_id o la respuesta es inválida.');
            botState.state = 'RUNNING'; // Reintentar buscar punto de entrada
        }
    } catch (error) {
        console.error('[AUTOBOT] Excepción al colocar la primera orden:', error.message);
        botState.state = 'RUNNING'; // Reintentar buscar punto de entrada
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
        botState.state = 'NO_COVERAGE';
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
        botState.state = 'RUNNING'; // Volver a RUNNING para buscar nueva entrada
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
                botState.state = 'RUNNING'; // Volver a RUNNING para que espere la nueva señal de COMPRA
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
    console.log(`\n--- Ejecutando lógica del bot. Estado actual: ${botState.state} ---`);

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

        switch (botState.state) {
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
                    // Calcula el precio de venta (pv) como PM - 0.5% (o el porcentaje que defina tu estrategia)
                    // Este es tu "trailing stop" para asegurar ganancias.
                    botState.pv = botState.pm * (1 - (0.5 / 100)); // Usamos 0.5 como porcentaje real (no 0.005)
                    // Precio de Caída (pc) como PM - 0.4%. Este es el punto de no retorno para vender.
                    botState.pc = botState.pm * (1 - (0.4 / 100)); // Usamos 0.4 como porcentaje real (no 0.004)
                }

                // **Mejora importante:** Asegurar que PV y PC siempre permitan una ganancia sobre el PPC
                // Esto previene vender por debajo del costo o con una pérdida innecesaria.
                if (botState.pv <= botState.ppc) {
                    // Si el PV calculado está por debajo o igual al PPC, lo ajustamos para asegurar una ganancia mínima (ej. 0.3%)
                    botState.pv = botState.ppc * 1.003;
                    console.warn('[AUTOBOT] PV ajustado para asegurar ganancia mínima sobre PPC.');
                }
                if (botState.pc <= botState.ppc) {
                    // Si el PC calculado está por debajo o igual al PPC, lo ajustamos ligeramente por encima del PPC
                    // Esto evita un stop loss "negativo" si el mercado cae justo después de una compra.
                    botState.pc = botState.ppc * 1.001; // Un margen muy pequeño sobre el costo
                    console.warn('[AUTOBOT] PC ajustado para proteger el capital sobre PPC.');
                }

                // Si el precio actual cae por debajo del precio de caída (pc)
                // y el bot tiene activo (BTC) para vender, entonces procede a vender.
                if ((botState.currentPrice <= botState.pc) && botState.ac > 0) {
                    console.log('[AUTOBOT] Condiciones de venta alcanzadas! Colocando orden de venta.');
                    await placeSellOrder(); // Llama a la función para ejecutar la orden de venta
                } else {
                    console.log(`[AUTOBOT] Esperando condiciones para la venta. Precio actual: ${botState.currentPrice.toFixed(2)}, PM: ${botState.pm.toFixed(2)}, PV: ${botState.pv.toFixed(2)}, PC: ${botState.pc.toFixed(2)}, PPC: ${botState.ppc.toFixed(2)}`);
                }
                break;

            case 'NO_COVERAGE':
                console.log(`[AUTOBOT] Estado: NO_COVERAGE. Esperando fondos para la próxima orden de ${botState.nextCoverageUSDTAmount.toFixed(2)} USDT @ ${botState.nextCoverageTargetPrice.toFixed(2)}.`);
                // Si el balance USDT disponible ahora es suficiente, intenta volver a BUYING
                if (availableUSDT >= botState.nextCoverageUSDTAmount && botState.nextCoverageUSDTAmount >= MIN_USDT_VALUE_FOR_BITMART) {
                    console.log('[AUTOBOT] Fondos disponibles. Volviendo a estado BUYING para intentar la orden de cobertura.');
                    botState.state = 'BUYING';
                    // La próxima ejecución de runBotLogic en estado BUYING detectará la necesidad de colocar la orden.
                }
                // Si la lógica de venta global no ha movido al bot a SELLING, se queda aquí esperando fondos.
                break;

            case 'ERROR':
                console.error('[AUTOBOT] Estado: ERROR. El bot ha encontrado un error crítico. Requiere intervención manual.');
                // Puedes añadir lógica para notificar, reintentar o apagar completamente.
                break;

            case 'STOPPED':
                console.log('[AUTOBOT] Estado: STOPPED. El bot está inactivo.');
                // No se hace nada en este estado, el intervalo ya fue limpiado.
                break;

            default:
                console.warn(`[AUTOBOT] Estado desconocido del bot: ${botState.state}. Estableciendo a STOPPED.`);
                botState.state = 'STOPPED';
                break;
        }
    } catch (error) {
        console.error('[AUTOBOT] Excepción en runBotLogic:', error.message);
        // Si hay un error inesperado, podrías querer detener el bot o marcar un estado de error
        // botState.state = 'ERROR'; // Descomentar si quieres que el bot entre en estado de error
    } finally {
        // Guarda el estado del bot después de cada ejecución de la lógica, si está activo
        if (botState.state !== 'STOPPED') { // Solo guarda si el bot no está detenido permanentemente
            await saveBotStateToDB();
        }
        // Emitir el estado actual del bot al frontend después de cada ciclo
        if (ioInstance) {
            ioInstance.emit('botStateUpdate', botState);
        }
    }
}

// --- Funciones para iniciar/detener el bot ---
async function startBotStrategy(params) {
    // Si el botState.state ya está RUNNING, BUYING o SELLING, significa que ya está activo
    if (botState.state !== 'STOPPED' && botState.state !== 'NO_COVERAGE' && botState.strategyIntervalId !== null) {
        console.warn(`[AUTOBOT] Intento de iniciar bot ya en estado: ${botState.state}.`);
        if (ioInstance) {
            ioInstance.emit('botStateUpdate', botState);
        }
        return { success: false, message: `Bot is already ${botState.state}.`, botState: { ...botState } };
    }

    console.log('[AUTOBOT] Iniciando estrategia del bot...');
    Object.assign(botState, params); // Actualiza los parámetros del bot con los recibidos del frontend
    botState.state = 'RUNNING'; // Inicializa en RUNNING para buscar la primera señal
    botState.cycle = 0; // Reiniciar ciclos al iniciar
    botState.profit = 0; // Reiniciar ganancias al iniciar
    botState.ppc = 0; // Asegurarse de que PPC también se reinicie si el bot se inicia desde cero
    botState.ac = 0; // Asegurarse de que el activo en posesión se reinicie
    resetCycleVariables(); // Asegurar que las variables del ciclo estén limpias

    // Limpiar cualquier intervalo anterior si existe (por seguridad)
    if (botState.strategyIntervalId) {
        clearInterval(botState.strategyIntervalId);
    }

    // Iniciar el loop principal de la lógica del bot
    // Cada 5 segundos (ajusta según tus necesidades)
    botState.strategyIntervalId = setInterval(runBotLogic, 5000);
    console.log('[AUTOBOT] Loop de estrategia iniciado.');

    await saveBotStateToDB(); // Guarda el estado de RUNNING
    if (ioInstance) {
        ioInstance.emit('botStateUpdate', botState);
    }
    return { success: true, message: 'Bot strategy started.', botState: { ...botState } };
}

async function stopBotStrategy() {
    if (botState.strategyIntervalId) {
        console.log('[AUTOBOT] Deteniendo la estrategia del bot.');
        clearInterval(botState.strategyIntervalId);
        botState.strategyIntervalId = null;
    }
    botState.state = 'STOPPED';
    // Asegurarse de cancelar órdenes abiertas al detener el bot
    await cancelOpenOrders(TRADE_SYMBOL);
    if (ioInstance) {
        ioInstance.emit('botStateUpdate', botState);
    }
    await saveBotStateToDB(); // Guarda el estado de STOPPED
    return { success: true, message: 'Bot strategy stopped.', botState: { ...botState } };
}

// --- Exportaciones ---
module.exports = {
    botState,
    setIoInstance,
    loadBotStateFromDB,
    saveBotStateToDB, // Útil para llamadas manuales desde el servidor
    startBotStrategy,
    stopBotStrategy,
    // Exporta runBotLogic si necesitas llamarla directamente desde server.js para pruebas
    runBotLogic
};