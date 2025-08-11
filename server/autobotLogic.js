// autobotLogic.js

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const analyzer = require('./bitmart_indicator_analyzer'); // Importamos el analizador

let io;
let intervalId; // Para almacenar el ID del intervalo del ciclo del bot
let botIsRunning = false;
let currentLState = 'STOPPED';
let currentSState = 'STOPPED';

// --- CONFIGURACIÓN DE LA ESTRATEGIA (AJUSTABLE) ---
// Estos valores deberían venir de la base de datos o de inputs en el frontend en un futuro.
const SYMBOL = 'BTC_USDT';
const BUY_PRICE = 100000.00;
const SELL_PRICE = 150000.00;
const PURCHASE_USDT_AMOUNT = 10; // Cantidad de USDT a comprar
const PURCHASE_BTC_AMOUNT = 0.0001; // Cantidad de BTC a vender

/**
 * Establece la instancia de Socket.IO para emitir logs al frontend.
 * @param {object} socketIo - La instancia de Socket.IO.
 */
function setIo(socketIo) {
    io = socketIo;
}

/**
 * Emite un log al frontend a través de Socket.IO.
 * @param {string} message - El mensaje del log.
 * @param {string} type - El tipo de mensaje ('info', 'success', 'error', etc.).
 */
function log(message, type = 'info') {
    if (io) {
        io.emit('bot-log', { message, type, timestamp: new Date().toISOString() });
    }
    console.log(`[BOT LOG]: ${message}`);
}

/**
 * Actualiza el estado del bot en la DB y en el frontend.
 * @param {string} lState - Estado para el Long.
 * @param {string} sState - Estado para el Short.
 */
async function updateBotState(lState, sState) {
    try {
        currentLState = lState;
        currentSState = sState;

        const autobot = await Autobot.findOne({});
        if (autobot) {
            autobot.lstate = lState;
            autobot.sstate = sState;
            await autobot.save();
        }

        // Emitir el estado actualizado al frontend
        if (io) {
            io.emit('bot-state-update', { lstate: currentLState, sstate: currentSState });
        }
    } catch (error) {
        log(`Error al actualizar el estado del bot: ${error.message}`, 'error');
    }
}

/**
 * Lógica principal del bot que se ejecuta en un ciclo.
 */
async function botMainLoop() {
    if (!botIsRunning) return;
    try {
        log("Ejecutando el ciclo principal del bot...", 'info');

        // Paso 1: Obtener el precio actual para el analizador
        const ticker = await bitmartService.getTicker(SYMBOL);
        if (!ticker || !ticker.last) {
            log("No se pudo obtener el precio actual del ticker de BitMart.", 'error');
            return;
        }
        const currentPrice = parseFloat(ticker.last);
        log(`Precio actual de ${SYMBOL}: $${currentPrice.toFixed(2)}`, 'info');

        // Paso 2: Ejecutar el analizador para obtener una señal
        const signal = await analyzer.runAnalysis(currentPrice);

        // Paso 3: Actuar según la señal recibida
        switch (signal.action) {
            case 'BUY':
    log(`Señal de COMPRA detectada: ${signal.reason}`, 'info');
    const buyOrder = await bitmartService.placeOrder(
        // **CORRECCIÓN:** Asegúrate de que los parámetros se pasan en el orden correcto
        SYMBOL, // symbol
        'buy',  // side
        PURCHASE_USDT_AMOUNT, // size
        BUY_PRICE // price
    );
                log(`Orden de compra colocada. ID de la orden: ${buyOrder?.data?.orderId || 'N/A'}`, 'success');
                break;

            case 'SELL':
    log(`Señal de VENTA detectada: ${signal.reason}`, 'info');
    const sellOrder = await bitmartService.placeOrder(
        // **CORRECCIÓN:** Asegúrate de que los parámetros se pasan en el orden correcto
        SYMBOL, // symbol
        'sell', // side
        PURCHASE_BTC_AMOUNT, // size
        SELL_PRICE // price
    );
                log(`Orden de venta colocada. ID de la orden: ${sellOrder?.data?.orderId || 'N/A'}`, 'success');
                break;

            case 'HOLD':
            default:
                log(`Señal de ESPERA detectada. Razón: ${signal.reason}`, 'info');
                // No se realiza ninguna acción de trading
                break;
        }

    } catch (error) {
        log(`Error en el ciclo del bot: ${error.message}`, 'error');
    }
}

/**
 * Inicia la estrategia del Autobot.
 */
async function start() {
    if (botIsRunning) return log('El bot ya está en ejecución.', 'warning');
    
    botIsRunning = true;
    await updateBotState('RUNNING', 'RUNNING');
    log("El bot ha iniciado correctamente.", 'success');
    
    // Iniciar un ciclo que se repita cada 5 segundos
    intervalId = setInterval(botMainLoop, 5000);
}

/**
 * Detiene la estrategia del Autobot.
 */
async function stop() {
    if (!botIsRunning) return log('El bot ya está detenido.', 'warning');
    
    // Detener el ciclo del bot
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }

    // Cancelar todas las órdenes abiertas
    try {
        log("Cancelando todas las órdenes abiertas...", 'info');
        const ordersCancelled = await bitmartService.cancelAllOrders(SYMBOL);
        log(`Se cancelaron ${ordersCancelled?.length || 0} órdenes abiertas.`, 'success');
    } catch (error) {
        log(`Error al cancelar órdenes: ${error.message}`, 'error');
    }

    botIsRunning = false;
    await updateBotState('STOPPED', 'STOPPED');
    log("El bot se ha detenido.", 'success');
}

module.exports = {
    setIo,
    start,
    stop,
};