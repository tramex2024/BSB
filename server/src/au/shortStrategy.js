// BSB/server/src/au/shortStrategy.js (ESPEJO DE longStrategy.js)

// Importa los módulos de cada estado para SHORT
const SRunning = require('./states/short/SRunning'); // Vigilante de señal
const SSelling = require('./states/short/SSelling'); // Entrando/Promediando Short (Venta)
const SBuying = require('./states/short/SBuying');   // Cerrando Short con ganancia (Compra)
const SNoCoverage = require('./states/short/SNoCoverage');
const SStopped = require('./states/short/SStopped');

let dependencies = {};

function setDependencies(deps) {
    dependencies = deps;
}

async function runShortStrategy() {
    const { botState } = dependencies;

    // Selecciona la función a ejecutar basándose en el estado sstate (Short State)
    switch (botState.sstate) {
        case 'RUNNING':
            await SRunning.run(dependencies);
            break;
        case 'SELLING': 
            // 💡 En Short, SELLING es el equivalente a BUYING en Long: 
            // Es donde abrimos la posición y hacemos DCA (Vender más caro).
            await SSelling.run(dependencies);
            break;
        case 'BUYING':
            // 💡 En Short, BUYING es el equivalente a SELLING en Long:
            // Es donde recompramos barato para cerrar el ciclo y tomar ganancias.
            await SBuying.run(dependencies);
            break;
        case 'NO_COVERAGE':
            await SNoCoverage.run(dependencies);
            break;
        case 'STOPPED':
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