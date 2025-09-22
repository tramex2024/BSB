// BSB/server/src/states/long/LRunning.js

const autobotCore = require('../../autobotLogic');
const analyzer = require('../../bitmart_indicator_analyzer');
const { placeFirstBuyOrder } = require('../../placeFirstBuyOrder'); // Nota: esta función debe ser extraída

async function run(dependencies) {
    const { botState, currentPrice, availableUSDT, config, creds } = dependencies;

    autobotCore.log("Estado Long: RUNNING. Esperando señal de entrada de COMPRA.", 'info');

    const analysisResult = await analyzer.runAnalysis(currentPrice);

    if (analysisResult.action === 'BUY') {
        autobotCore.log(`¡Señal de COMPRA detectada! Razón: ${analysisResult.reason}`, 'success');
        const purchaseAmount = parseFloat(config.long.purchaseUsdt);
        const MIN_USDT_VALUE_FOR_BITMART = 5.00;

        if (availableUSDT >= purchaseAmount && purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART) {
            await placeFirstBuyOrder(config, creds);
        } else {
            autobotCore.log(`No hay suficiente USDT para la primera orden. Cambiando a NO_COVERAGE.`, 'warning');
            await autobotCore.updateBotState('NO_COVERAGE', botState.sstate);
        }
    }
}

module.exports = { run };