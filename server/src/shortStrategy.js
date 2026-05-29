/**
 * ESTRATEGIA SHORT - STATE MACHINE (BSB 2026)
 * Gestión de ciclos de vida para operaciones de Venta/Recompra con mitigación de pánico.
 */

const SRunning = require('./states/short/SRunning'); // Scan de entrada
const SSelling = require('./states/short/SSelling'); // DCA (Venta de BTC)
const SBuying  = require('./states/short/SBuying');  // Take Profit (Compra de BTC)
const SPaused  = require('./states/short/SPaused');
const SStopped = require('./states/short/SStopped');

/**
 * Ejecuta la lógica correspondiente según el estado actual del Short.
 * @param {Object} dependencies - Inyección de contexto atómica por usuario.
 */
async function runShortStrategy(dependencies) {
    // 1. Validación de seguridad (Fail-fast)
    if (!dependencies || !dependencies.botState || !dependencies.userId) return;

    const { botState, userId, log, updateBotState } = dependencies;
    const currentState = botState.sstate || 'STOPPED';

    try {
        /**
         * MÁQUINA DE ESTADOS SHORT
         * Delegamos la ejecución a submódulos especializados. 
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
                log(`⚠️ Unknown Short state: ${currentState}`, 'error');
                break;
        }
    } catch (error) {
        // [BLINDAJE DE EMERGENCIA]: Aislamos el error e impedimos bucles infinitos de CPU/Red en operaciones Short.
        log(`🔥 ShortStrategy Error [${currentState}]: ${error.message}`, 'error');
        console.error(`[CRITICAL-SHORT][User: ${userId}]:`, error);

        // Si el error ocurre en un estado transaccional activo, pausamos el bot para congelar la exposición al mercado
        if (currentState === 'BUYING' || currentState === 'SELLING' || currentState === 'RUNNING') {
            try {
                log(`🚨 [FALLBACK SHORT ACTIVADO] Forzando transición de emergencia [${currentState} ➡️ PAUSED] para mitigar riesgos en corto.`, 'warning');
                if (typeof updateBotState === 'function') {
                    await updateBotState('PAUSED', 'short');
                } else {
                    // Respaldo directo en el objeto en memoria por seguridad de subprocesos
                    botState.sstate = 'PAUSED';
                }
            } catch (fallbackError) {
                console.error(`💥 [SUPER-CRITICAL-SHORT] Falló el sistema de mitigación de pánico Short para el usuario ${userId}:`, fallbackError.message);
            }
        }
    }
}

module.exports = {
    runShortStrategy
};