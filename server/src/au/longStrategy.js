// BSB/server/src/au/longStrategy.js

// Importa los módulos de cada estado
const LRunning = require('./states/long/LRunning');
const LBuying = require('./states/long/LBuying');
const LSelling = require('./states/long/LSelling');
const LNoCoverage = require('./states/long/LNoCoverage');
const LStopped = require('./states/long/LStopped');

let dependencies = {};

function setDependencies(deps) {
    dependencies = deps;
}

async function runLongStrategy() {
    const { botState, currentPrice, availableUSDT, availableBTC } = dependencies;

    // Selecciona la función a ejecutar basándose en el estado actual del bot
    switch (botState.lstate) {
        case 'RUNNING':
            await LRunning.run(dependencies);
            break;
        case 'BUYING':
            await LBuying.run(dependencies);
            break;
        case 'SELLING':
            await LSelling.run(dependencies);
            break;
        case 'NO_COVERAGE':
            await LNoCoverage.run(dependencies);
            break;
        case 'STOPPED':
            await LStopped.run(dependencies);
            break;
        default:
            console.error(`Estado Long desconocido: ${botState.lstate}`);
            break;
    }
}

module.exports = {
    runLongStrategy,
    setDependencies
};