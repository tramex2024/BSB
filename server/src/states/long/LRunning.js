// BSB/server/src/states/long/LRunning.js (ACTUALIZADO - Con corrección de estado)

const analyzer = require('../../bitmart_indicator_analyzer');
const { placeFirstBuyOrder } = require('../../utils/orderManager');

async function run(dependencies) {
    // Extraemos las funciones de las dependencias
    const { botState, currentPrice, availableUSDT, config, creds, log, updateBotState } = dependencies;

    log("Estado Long: RUNNING. Esperando señal de entrada de COMPRA.", 'info');

    const analysisResult = await analyzer.runAnalysis(currentPrice);

    if (analysisResult.action === 'BUY') {
        log(`¡Señal de COMPRA detectada! Razón: ${analysisResult.reason}`, 'success');
        const purchaseAmount = parseFloat(config.long.purchaseUsdt);
        const MIN_USDT_VALUE_FOR_BITMART = 5.00;

        if (availableUSDT >= purchaseAmount && purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART) {
            // Llama a la función y pasa log y updateBotState
            await placeFirstBuyOrder(config, creds, log, updateBotState); 
        } else {
            log(`No hay suficiente USDT para la primera orden. Cambiando a NO_COVERAGE.`, 'warning');
            
            // CORRECCIÓN: Usar 'long' en lugar de botState.sstate
            await updateBotState('NO_COVERAGE', 'long'); 
        }
    }
}

module.exports = { run };