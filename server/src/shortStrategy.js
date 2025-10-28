// BSB/server/src/shortStrategy.js

// Importa los módulos de cada estado Short (asumiendo que los nombraremos simétricamente)
const SRunning = require('./states/short/SRunning');
const SBuying = require('./states/short/SBuying');
const SSelling = require('./states/short/SSelling');
const SNoCoverage = require('./states/short/SNoCoverage');
const SStopped = require('./states/short/SStopped');

let dependencies = {};

/**
 * Establece las dependencias (botState, currentPrice, log, etc.) que se pasarán a cada estado.
 * @param {object} deps - Objeto de dependencias.
 */
function setDependencies(deps) {
    dependencies = deps;
}

/**
 * Ejecuta el ciclo de la estrategia Short basándose en su estado actual (sstate).
 */
async function runShortStrategy() {
    const { botState } = dependencies;
    const shortState = botState.sstate; // Usamos sstate para la estrategia Short

    // Selecciona la función a ejecutar basándose en el estado actual del bot
    switch (shortState) {
        case 'RUNNING':
            // Estado inicial o de reposo. Se encarga de la VENTA inicial.
            await SRunning.run(dependencies);
            break;
        case 'BUYING':
            // Estado activo de gestión de posición (DCA UP). Gestiona las VENTAS de cobertura.
            await SBuying.run(dependencies);
            break;
        case 'SELLING':
            // Estado activo de cierre de posición. Gestiona la COMPRA de cierre/TP.
            await SSelling.run(dependencies);
            break;
        case 'NO_COVERAGE':
            // Esperando la reposición de capital BTC o el precio de TP.
            await SNoCoverage.run(dependencies);
            break;
        case 'STOPPED':
            // Detenido por el usuario.
            await SStopped.run(dependencies);
            break;
        default:
            console.error(`[SHORT] Estado Short desconocido: ${shortState}`);
            break;
    }
}

module.exports = {
    runShortStrategy,
    setDependencies
};