/**
 * ESTRATEGIA SHORT - STATE MACHINE (BSB 2026)
 * Gestión de ciclos de vida para operaciones de Venta/Recompra.
 */

const SRunning = require('./au/states/short/SRunning'); // Scan de entrada
const SSelling = require('./au/states/short/SSelling'); // DCA (Venta de BTC)
const SBuying  = require('./au/states/short/SBuying');  // Take Profit (Compra de BTC)
const SPaused  = require('./au/states/short/SPaused');
const SStopped = require('./au/states/short/SStopped');

/**
 * Ejecuta la lógica correspondiente según el estado actual del Short.
 * @param {Object} dependencies - Inyección de contexto atómica por usuario.
 */
async function runShortStrategy(dependencies) {
    // 1. Validación de seguridad
    if (!dependencies || !dependencies.botState) return;

    const { botState, userId, log } = dependencies;
    const currentState = botState.sstate || 'STOPPED';

    try {
        /**
         * MÁQUINA DE ESTADOS SHORT
         * Nota: En Short, 'SELLING' es el proceso de acumulación y 'BUYING' es el cierre.
         */
        switch (currentState) {
            case 'RUNNING':
                // Buscando sobrecompra (RSI alto) o señal de caída
                await SRunning.run(dependencies);
                break;

            case 'SELLING': 
                // Ejecutando venta inicial o incrementando posición (DCA Short)
                await SSelling.run(dependencies);
                break;

            case 'BUYING':
                // Monitoreando el precio para recomprar con profit (Take Profit)
                await SBuying.run(dependencies);
                break;

            case 'PAUSED':
                // Estado de espera por falta de colateral o error de API
                await SPaused.run(dependencies);
                break;

            case 'STOPPED':
                // Inactivo
                await SStopped.run(dependencies);
                break;

            default:
                log(`⚠️ Unknown Short state for user ${userId}: ${currentState}`, 'error');
                break;
        }
    } catch (error) {
        log(`🔥 ShortStrategy Error [${currentState}]: ${error.message}`, 'error');
        console.error(`[CRITICAL-SHORT][User: ${userId}]:`, error);
    }
}

// Exportación simplificada para el motor central
module.exports = {
    runShortStrategy
};