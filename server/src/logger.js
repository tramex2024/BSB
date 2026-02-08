//BSB/server/src/logger.js

/**
 * Módulo de logging avanzado para el Autobot Multi-usuario.
 * Soporta prefijos de color y vinculación de logs a usuarios específicos.
 */

const colors = {
    reset: "\x1b[0m",
    info: "\x1b[36m",    // Cyan
    debug: "\x1b[90m",   // Gris
    error: "\x1b[31m",   // Rojo
    warning: "\x1b[33m", // Amarillo
    success: "\x1b[32m", // Verde
    header: "\x1b[35m",  // Magenta
};

/**
 * Función principal para registrar mensajes.
 * @param {string} message - El mensaje a registrar.
 * @param {string} level - Nivel: 'info', 'debug', 'error', 'success', 'warning'.
 * @param {string} userId - (Opcional) ID del usuario para rastreo multi-usuario.
 */
function log(message, level = 'info', userId = 'SYSTEM') {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const color = colors[level] || colors.info;
    
    // Formateamos el ID de usuario para que todos los logs queden alineados
    const userPrefix = userId ? `[${userId.slice(-6)}]` : `[GLOBAL]`;
    const prefix = `[${timestamp}] ${userPrefix} [${level.toUpperCase()}]`;
    
    // Control de verbosidad para modo Debug
    if (level === 'debug') {
        // Descomenta la siguiente línea para silenciar los logs de cálculo pesado
        // return; 
    }

    console.log(`${color}${prefix} ${message}${colors.reset}`);
}

module.exports = { log };