/**
 * ESTRATEGIA LONG - STATE MACHINE (BSB 2026)
 * Gestión segura de ciclos de vida de posiciones Long.
 */

const LRunning = require('./au/states/long/LRunning');
const LBuying  = require('./au/states/long/LBuying');
const LSelling = require('./au/states/long/LSelling');
const LPaused  = require('./au/states/long/LPaused');
const LStopped = require('./au/states/long/LStopped');

/**
 * Ejecuta el paso correspondiente del State Machine del Long.
 * @param {Object} dependencies - Recibe las dependencias directamente del autobotLogic.
 */
async function runLongStrategy(dependencies) {
    // 1. Verificación de integridad (Fail-fast)
    // 🟢 AUDITORÍA: userId es mandatorio para asegurar que ningún proceso corra sin identidad
    if (!dependencies || !dependencies.botState || !dependencies.userId) {
        return; 
    }

    const { botState, log, userId } = dependencies;
    const currentState = botState.lstate || 'STOPPED';

    try {
        /**
         * PATRÓN STATE MACHINE
         * Delegamos la lógica pesada a submódulos especializados.
         * El objeto 'log' ya viene configurado desde autobotLogic para emitir
         * a la sala privada (userId) sin prefijos incorrectos.
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
                // Log estanco por usuario
                log(`⚠️ Unknown Long state: ${currentState}`, 'error');
                break;
        }
    } catch (error) {
        // Aislamiento de errores: El fallo de un usuario no afecta al resto del botCycle
        // 🟢 AUDITORÍA: El uso de userId en el console.error permite debugear fallos específicos sin mezclar logs
        log(`🔥 Error in LongStrategy [${currentState}]: ${error.message}`, 'error');
        console.error(`[CRITICAL-LONG][User: ${userId}]:`, error);
    }
}

module.exports = {
    runLongStrategy
};