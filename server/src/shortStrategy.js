// BSB/server/src/shortStrategy.js (ACTUALIZADO - Router de Estados)

// Importa los módulos de cada estado Short (Asumimos que ya los creaste)
const SRunning = require('./states/short/SHRunning');
const SBuying = require('./states/short/SHBuying');
const SSelling = require('./states/short/SHSelling');
const SNoCoverage = require('./states/short/SHNoCoverage');
const SStopped = require('./states/short/SHStopped');

let dependencies = {};

function setDependencies(deps) {
    dependencies = deps;
}

async function runShortStrategy() {
    const { botState } = dependencies;

    // Selecciona la función a ejecutar basándose en el estado actual del bot
    switch (botState.sstate) { // Nota: usamos sstate para la estrategia Short
        case 'RUNNING':
            await SRunning.run(dependencies);
            break;
        case 'BUYING':
            await SBuying.run(dependencies);
            break;
        case 'SELLING':
            await SSelling.run(dependencies);
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