/**
 * Módulo de logging simple para el Autobot.
 * Muestra logs con prefijos de color para facilitar el seguimiento.
 * Asume que este archivo se encuentra en la ruta correcta para ser accesible
 * por dataManager.js (ej: BSB/server/src/logger.js).
 */

const colors = {
    reset: "\x1b[0m",
    info: "\x1b[36m",    // Cyan
    debug: "\x1b[90m",   // Gris brillante
    error: "\x1b[31m",   // Rojo
    warning: "\x1b[33m", // Amarillo
    success: "\x1b[32m", // Verde
    header: "\x1b[35m",  // Magenta
};

/**
 * Función principal para registrar mensajes.
 * @param {string} message El mensaje a registrar.
 * @param {string} level El nivel del log ('info', 'debug', 'error', etc.).
 */
function log(message, level = 'info') {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const color = colors[level] || colors.info;
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    // Si necesitas ver logs detallados de cálculo, elimina el 'return;'
    if (level === 'debug') {
        // return; 
    }

    console.log(`${color}${prefix} ${message}${colors.reset}`);
}

module.exports = { log };
