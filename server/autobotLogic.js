// autobotLogic.js

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService');
const analyzer = require('./bitmart_indicator_analyzer');

let io;
let intervalId;
let botIsRunning = false;
let currentLState = 'STOPPED';
let currentSState = 'STOPPED';

// --- NUEVAS VARIABLES DE CONFIGURACIÓN Y ESTADO ---
let activeBotOrders = []; // Almacena las IDs de las órdenes que coloca el bot
let botConfiguration; // Almacena la configuración de la estrategia (montos, etc.)
let AUTH_CREDS = {}; // Guarda las credenciales de autenticación

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

        const SYMBOL = botConfiguration.symbol;
        
        const ticker = await bitmartService.getTicker(SYMBOL);
        if (!ticker || !ticker.last) {
            log("No se pudo obtener el precio actual del ticker de BitMart.", 'error');
            return;
        }
        const currentPrice = parseFloat(ticker.last);
        log(`Precio actual de ${SYMBOL}: $${currentPrice.toFixed(2)}`, 'info');

        const signal = await analyzer.runAnalysis(currentPrice);

        switch (signal.action) {
            case 'BUY':
                log(`Señal de COMPRA detectada: ${signal.reason}`, 'info');
                try {
                    const buyOrder = await bitmartService.placeOrder(
                        AUTH_CREDS,
                        SYMBOL,
                        'buy',
                        'market', 
                        botConfiguration.purchaseUsdtAmount 
                    );
                    if (buyOrder && buyOrder.order_id) {
                        activeBotOrders.push(buyOrder.order_id);
                        log(`Orden de compra colocada. ID de la orden: ${buyOrder.order_id}`, 'success');
                    } else {
                        log('Error: La respuesta de la orden de compra no contiene un ID.', 'error');
                    }
                } catch (error) {
                    log(`Error al colocar la orden de compra: ${error.message}`, 'error');
                }
                break;

            case 'SELL':
                log(`Señal de VENTA detectada: ${signal.reason}`, 'info');
                try {
                    const sellOrder = await bitmartService.placeOrder(
                        AUTH_CREDS,
                        SYMBOL,
                        'sell',
                        'market', 
                        botConfiguration.purchaseBtcAmount
                    );
                    if (sellOrder && sellOrder.order_id) {
                        activeBotOrders.push(sellOrder.order_id);
                        log(`Orden de venta colocada. ID de la orden: ${sellOrder.order_id}`, 'success');
                    } else {
                        log('Error: La respuesta de la orden de venta no contiene un ID.', 'error');
                    }
                } catch (error) {
                    log(`Error al colocar la orden de venta: ${error.message}`, 'error');
                }
                break;

            case 'HOLD':
            default:
                log(`Señal de ESPERA detectada. Razón: ${signal.reason}`, 'info');
                break;
        }

    } catch (error) {
        log(`Error en el ciclo del bot: ${error.message}`, 'error');
    }
}

/**
 * Inicia la estrategia del Autobot con una configuración específica.
 * @param {object} config - Objeto de configuración del bot.
 * @param {object} authCreds - Objeto con las credenciales de la API de BitMart.
 */
async function start(config, authCreds) {
    if (botIsRunning) return log('El bot ya está en ejecución.', 'warning');
    
    // Asignar la configuración y las credenciales al estado global
    botConfiguration = config;
    AUTH_CREDS = authCreds;
    
    // Validación básica de la configuración
    if (!botConfiguration || !AUTH_CREDS) {
        log('Error: Falta configuración o credenciales para iniciar el bot.', 'error');
        return;
    }

    botIsRunning = true;
    await updateBotState('RUNNING', 'RUNNING');
    log("El bot ha iniciado correctamente.", 'success');
    
    intervalId = setInterval(botMainLoop, botConfiguration.interval || 5000);
}

/**
 * Detiene la estrategia del Autobot.
 */
async function stop() {
    if (!botIsRunning) return log('El bot ya está detenido.', 'warning');
    
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }

    try {
        if (activeBotOrders.length > 0) {
            log(`Cancelando las ${activeBotOrders.length} órdenes activas del bot...`, 'info');
            for (const orderId of activeBotOrders) {
                await bitmartService.cancelOrder(AUTH_CREDS, botConfiguration.symbol, orderId);
                log(`Orden ${orderId} cancelada.`, 'success');
            }
        } else {
            log('No se encontraron órdenes activas del bot para cancelar.', 'info');
        }
        
        activeBotOrders = [];

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