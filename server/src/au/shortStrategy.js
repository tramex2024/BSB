// BSB/server/src/au/shortStrategy.js (ESPEJO DE longStrategy.js)

// Importa los módulos de cada estado para SHORT
const SRunning = require('./states/short/SRunning'); // Vigilante de señal
const SSelling = require('./states/short/SSelling'); // Entrando/Promediando Short (Venta)
const SBuying = require('./states/short/SBuying');   // Cerrando Short con ganancia (Compra)
const SPaused = require('./states/short/SPaused');
const SStopped = require('./states/short/SStopped');

let dependencies = {};

function setDependencies(deps) {
    dependencies = deps;
}

async function runShortStrategy() {
    const { botState } = dependencies;

    switch (botState.sstate) {
        case 'RUNNING':
            await SRunning.run(dependencies);
            break;
        case 'SELLING': 
            await SSelling.run(dependencies);
            break;
        case 'BUYING':
            await SBuying.run(dependencies);
            break;
        case 'PAUSED':
            await SPaused.run(dependencies);
            break;
        case 'STOPPED':
            await SStopped.run(dependencies); // RE-ACTIVADO
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