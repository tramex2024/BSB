// BSB/server/src/au/longStrategy.js

const LRunning = require('./states/long/LRunning');
const LBuying = require('./states/long/LBuying');
const LSelling = require('./states/long/LSelling');
const LNoCoverage = require('./states/long/LNoCoverage');
const LStopped = require('./states/long/LStopped');

let dependencies = {};

/**
 * Inyecta las dependencias necesarias (log, bitmartService, updateGeneralBotState, etc.)
 * Sincronizado con la Estructura Plana 2026.
 */
function setDependencies(deps) {
    dependencies = deps;
}

/**
 * Ejecuta el paso correspondiente del State Machine del Long.
 * La lógica exponencial se decide dentro de cada estado usando 'dependencies.config'.
 */
async function runLongStrategy() {
    // 1. Verificación de integridad de dependencias
    if (!dependencies || !dependencies.botState) {
        return; 
    }

    const { botState, log } = dependencies;
    const currentState = botState.lstate || 'STOPPED';

    try {
        // 
        
        switch (currentState) {
            case 'RUNNING':
                // Estado de espera/decisión: decide si entrar al mercado o esperar precio.
                await LRunning.run(dependencies);
                break;
                
            case 'BUYING':
                // Gestión de compras: Ejecuta la lógica exponencial de DCA (Dollar Cost Averaging).
                // Aquí se utilizará config.long.price_step_inc para calcular distancias.
                await LBuying.run(dependencies);
                break;
                
            case 'SELLING':
                // Gestión de Take Profit: Compara currentPrice contra ltprice (Target Price).
                await LSelling.run(dependencies);
                break;
                
            case 'NO_COVERAGE':
                // Estado crítico: Se alcanzó el límite de órdenes o no hay saldo en Bitmart.
                await LNoCoverage.run(dependencies);
                break;
                
            case 'STOPPED':
                // Estado inactivo: No realiza operaciones pero puede limpiar estados residuales.
                await LStopped.run(dependencies);
                break;
                
            default:
                log(`⚠️ Estado Long desconocido: ${currentState}`, 'error');
                break;
        }
    } catch (error) {
        // El log se emite vía Socket al frontend automáticamente gracias a las dependencias.
        log(`🔥 Error en LongStrategy (${currentState}): ${error.message}`, 'error');
        console.error(`[LONG STRATEGY CRITICAL]:`, error);
    }
}

module.exports = {
    runLongStrategy,
    setDependencies
};