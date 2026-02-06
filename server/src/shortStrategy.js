// BSB/server/src/shortStrategy.js (Espejo de longStrategy.js)

// Importa los módulos de cada estado Short
const SRunning = require('./states/short/SRunning');
const SSelling = require('./states/short/SSelling'); // 🛑 DCA/Cobertura Short (Espejo de LBuying)
const SBuying = require('./states/short/SBuying');   // 🛑 Cierre/TP Short (Espejo de LSelling)
// 💡 Asumimos que los estados NO_COVERAGE y STOPPED son compartidos o tienen versiones Short
const SNoCoverage = require('./states/short/SNoCoverage'); 
const SStopped = require('./states/short/SStopped'); 

let dependencies = {};

/**
 * Asigna las dependencias (botState, price, logs, managers, balances, etc.)
 * @param {object} deps - Objeto de dependencias.
 */
function setDependencies(deps) {
    dependencies = deps;
}

/**
 * Ejecuta la lógica de la estrategia Short basándose en el estado actual (sstate).
 */
async function runShortStrategy() {
    // 💡 Aquí se usan las dependencias, que incluyen botState, currentPrice, availableUSDT/BTC, etc.
    const { botState } = dependencies;

    // Selecciona la función a ejecutar basándose en el estado actual del bot
    switch (botState.sstate) {
        case 'RUNNING':
            // 🛑 RUNNING: Espera la señal de VENTA (Short)
            await SRunning.run(dependencies);
            break;
        case 'SELLING':
            // 🛑 SELLING: Gestiona la posición Short (DCA Venta/Cobertura)
            await SSelling.run(dependencies);
            break;
        case 'BUYING':
            // 🛑 BUYING: Gestiona el cierre del Short (Trailing Stop/Take Profit Compra)
            await SBuying.run(dependencies);
            break;
        case 'NO_COVERAGE':
            // 🛑 NO_COVERAGE: Falta de capital BTC para continuar la cobertura Short
            await SNoCoverage.run(dependencies);
            break;
        case 'STOPPED':
            // 🛑 STOPPED: Detención del ciclo Short
            await SStopped.run(dependencies);
            break;
        default:
            console.error(`Estado Short desconocido: ${botState.sstate}`);
            break;
    }
}

module.exports = {
    runShortStrategy,
    setDependencies
};