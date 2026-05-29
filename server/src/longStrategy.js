/**
 * ESTRATEGIA LONG - STATE MACHINE (BSB 2026)
 * Gestión segura de ciclos de vida de posiciones Long con mitigación de pánico.
 */

const LRunning = require('./states/long/LRunning');
const LBuying  = require('./states/long/LBuying');
const LSelling = require('./states/long/LSelling');
const LPaused  = require('./states/long/LPaused');
const LStopped = require('./states/long/LStopped');

/**
 * Ejecuta el paso correspondiente del State Machine del Long.
 * @param {Object} dependencies - Recibe las dependencias directamente del autobotLogic.
 */
async function runLongStrategy(dependencies) {
    // 1. Verificación de integridad (Fail-fast)
    if (!dependencies || !dependencies.botState || !dependencies.userId) {
        return; 
    }

    const { botState, log, userId, updateBotState } = dependencies;
    const currentState = botState.lstate || 'STOPPED';

    try {
        /**
         * PATRÓN STATE MACHINE
         * Delegamos la lógica pesada a submódulos especializados.
         */
        switch (currentState) {
            case 'RUNNING':
                // Escaneo de señales de entrada (MarketSignal)
                await LRunning.run(dependencies);
                break;
                
            case 'BUYING':
                // Ejecución de órdenes de compra (Initial or DCA)
                await LBuying.run(dependencies);
                break;
                
            case 'SELLING':
                // Vigilancia de Take Profit y Trailings
                await LSelling.run(dependencies);
                break;
                
            case 'PAUSED':
                // Buffer de seguridad (Error de fondos o API)
                await LPaused.run(dependencies);
                break;
                
            case 'STOPPED':
                // Estado inactivo
                await LStopped.run(dependencies);
                break;
                
            default:
                log(`⚠️ Unknown Long state: ${currentState}`, 'error');
                break;
        }
    } catch (error) {
        // [BLINDAJE DE EMERGENCIA]: Aislamos el error e impedimos bucles infinitos de CPU.
        log(`🔥 Error crítico en LongStrategy [${currentState}]: ${error.message}`, 'error');
        console.error(`[CRITICAL-LONG][User: ${userId}]:`, error);

        // Si el error ocurre en un estado operativo crucial, pausamos el bot por seguridad del capital
        if (currentState === 'BUYING' || currentState === 'SELLING' || currentState === 'RUNNING') {
            try {
                log(`🚨 [FALLBACK ACTIVADO] Forzando transición de emergencia [${currentState} ➡️ PAUSED] para evitar corrupción de ciclo.`, 'warning');
                if (typeof updateBotState === 'function') {
                    await updateBotState('PAUSED', 'long');
                } else {
                    // Respaldo directo si el wrapper atómico de dependencias no responde
                    botState.lstate = 'PAUSED';
                }
            } catch (fallbackError) {
                console.error(`💥 [SUPER-CRITICAL] Falló el sistema de mitigación de pánico del usuario ${userId}:`, fallbackError.message);
            }
        }
    }
}

module.exports = {
    runLongStrategy
};