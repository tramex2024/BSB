// BSB/server/src/au/longStrategy.js

const LRunning = require('./states/long/LRunning');
const LBuying = require('./states/long/LBuying');
const LSelling = require('./states/long/LSelling');
const LNoCoverage = require('./states/long/LNoCoverage');
const LStopped = require('./states/long/LStopped');

let dependencies = {};

/**
 * Inyecta las dependencias necesarias (log, bitmartService, updateGeneralBotState, etc.)
 * Estas dependencias ya vienen configuradas para escribir en la raíz de la DB.
 */
function setDependencies(deps) {
    dependencies = deps;
}

/**
 * Ejecuta el paso correspondiente del State Machine del Long.
 * Gracias a la arquitectura plana, el acceso a 'botState.lstate' es instantáneo.
 */
async function runLongStrategy() {
    const { botState, log } = dependencies;

    // Verificación de seguridad
    if (!botState) return;

    try {
        switch (botState.lstate) {
            case 'RUNNING':
                // Estado de espera/decisión inicial
                await LRunning.run(dependencies);
                break;
                
            case 'BUYING':
                // Gestión de compras (Primera orden o DCA exponencial)
                await LBuying.run(dependencies);
                break;
                
            case 'SELLING':
                // Gestión de Take Profit (Monitor de salida)
                await LSelling.run(dependencies);
                break;
                
            case 'NO_COVERAGE':
                // Estado de pausa por falta de balance o error
                await LNoCoverage.run(dependencies);
                break;
                
            case 'STOPPED':
                // Bot apagado para el lado Long
                await LStopped.run(dependencies);
                break;
                
            default:
                log(`⚠️ Estado Long desconocido: ${botState.lstate}`, 'error');
                break;
        }
    } catch (error) {
        log(`🔥 Error en LongStrategy (${botState.lstate}): ${error.message}`, 'error');
    }
}

module.exports = {
    runLongStrategy,
    setDependencies
};