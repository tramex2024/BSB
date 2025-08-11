// autobotLogic.js

const Autobot = require('./models/Autobot');

let io;

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
 * Inicia la estrategia del Autobot.
 * @param {object} config - La configuración para iniciar el bot.
 */
async function start(config) {
    try {
        log("Iniciando la estrategia del bot...");

        let autobot = await Autobot.findOne({});
        if (!autobot) {
            // Crea un nuevo bot si no existe
            autobot = new Autobot({
                lstate: 'RUNNING',
                sstate: 'RUNNING',
                // ... otras configuraciones por defecto
            });
        } else {
            // Actualiza el estado del bot existente
            autobot.lstate = 'RUNNING';
            autobot.sstate = 'RUNNING';
        }
        await autobot.save();

        log("Estado del bot guardado en la base de datos.");
        log("El bot ha iniciado correctamente.", 'success');
        
        // Aquí iría la lógica principal de tu bot, como:
        // - Conexión con el exchange (BitMart).
        // - Lectura de los precios del mercado.
        // - Ejecución de las órdenes de compra/venta.
        // - Emisión de logs para cada acción importante.

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
        log("Deteniendo la estrategia del bot...");

        const autobot = await Autobot.findOne({});
        if (autobot) {
            autobot.lstate = 'STOPPED';
            autobot.sstate = 'STOPPED';
            await autobot.save();
        }

        log("Estado del bot guardado en la base de datos.");
        log("El bot se ha detenido.", 'success');

        // Aquí iría la lógica para detener cualquier proceso en curso, como:
        // - Cerrar conexiones.
        // - Guardar el estado actual.
        // - Cancelar órdenes pendientes.
        
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