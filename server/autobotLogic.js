// autobotLogic.js

const Autobot = require('./models/Autobot');
const bitmartService = require('./services/bitmartService'); // Asegúrate de que este servicio exista y funcione

let io;
let intervalId; // Para almacenar el ID del intervalo y poder detenerlo

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

// Lógica principal del bot que se ejecuta en un ciclo
async function botMainLoop() {
    try {
        log("Ejecutando el ciclo principal del bot...", 'info');

        // 1. Obtener datos del mercado (ejemplo: el precio actual de BTC)
        const ticker = await bitmartService.getTicker('BTC_USDT');
        if (ticker && ticker.last) {
            const currentPrice = parseFloat(ticker.last).toFixed(2);
            log(`Precio actual de BTC_USDT: $${currentPrice}`, 'info');

            // 2. Aquí iría tu lógica de trading
            // Por ejemplo:
            // if (currentPrice > 65000) {
            //     log("El precio es alto, considerando una venta...", 'info');
            //     // Lógica para colocar una orden de venta
            // } else if (currentPrice < 60000) {
            //     log("El precio es bajo, considerando una compra...", 'info');
            //     // Lógica para colocar una orden de compra
            // }

        } else {
            log("No se pudo obtener el precio del ticker de BitMart.", 'error');
        }

    } catch (error) {
        log(`Error inesperado en el ciclo del bot: ${error.message}`, 'error');
    }
}

/**
 * Inicia la estrategia del Autobot.
 * @param {object} config - La configuración para iniciar el bot.
 */
async function start(config) {
    try {
        log("Iniciando la estrategia del bot...", 'info');

        let autobot = await Autobot.findOne({});
        if (!autobot) {
            autobot = new Autobot({ lstate: 'RUNNING', sstate: 'RUNNING' });
        } else {
            autobot.lstate = 'RUNNING';
            autobot.sstate = 'RUNNING';
        }
        await autobot.save();

        log("Estado del bot guardado en la base de datos.", 'info');
        log("El bot ha iniciado correctamente.", 'success');
        
        // **CORRECCIÓN CLAVE:** Iniciar un ciclo que se repita cada 5 segundos
        intervalId = setInterval(botMainLoop, 5000);

    } catch (error) {
        log(`Error al iniciar el bot: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Detiene la estrategia del Autobot.
 */
async function stop() {
    try {
        log("Deteniendo la estrategia del bot...", 'info');
        
        // **CORRECCIÓN CLAVE:** Detener el ciclo del bot
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }

        const autobot = await Autobot.findOne({});
        if (autobot) {
            autobot.lstate = 'STOPPED';
            autobot.sstate = 'STOPPED';
            await autobot.save();
        }

        log("Estado del bot guardado en la base de datos.", 'info');
        log("El bot se ha detenido.", 'success');

    } catch (error) {
        log(`Error al detener el bot: ${error.message}`, 'error');
        throw error;
    }
}

module.exports = {
    setIo,
    start,
    stop,
};