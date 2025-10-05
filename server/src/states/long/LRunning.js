// BSB/server/src/states/long/LRunning.js (FINAL - Verifica Saldo Real Y Límite de Capital)

const analyzer = require('../../bitmart_indicator_analyzer');
const { placeFirstBuyOrder } = require('../../utils/orderManager');

async function run(dependencies) {
    // Restauramos updateGeneralBotState de las dependencias
    const { botState, currentPrice, availableUSDT, config, creds, log, updateBotState, updateGeneralBotState } = dependencies;

    log("Estado Long: RUNNING. Esperando señal de entrada de COMPRA.", 'info');

    const analysisResult = await analyzer.runAnalysis(currentPrice);

    if (analysisResult.action === 'BUY') {
        log(`¡Señal de COMPRA detectada! Razón: ${analysisResult.reason}`, 'success');
        const purchaseAmount = parseFloat(config.long.purchaseUsdt);
        const MIN_USDT_VALUE_FOR_BITMART = 5.00;
        
        // ⚠️ VERIFICACIÓN DEL LÍMITE DE CAPITAL (LBalance)
        const currentLBalance = parseFloat(botState.lbalance || 0);

        const isRealBalanceSufficient = availableUSDT >= purchaseAmount && purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART;
        const isCapitalLimitSufficient = currentLBalance >= purchaseAmount;
        
        if (isRealBalanceSufficient && isCapitalLimitSufficient) {
            // Llama a la función y pasa log y updateBotState
            // NOTA: placeFirstBuyOrder DEBE reducir LBalance después de la orden exitosa.
            await placeFirstBuyOrder(config, creds, log, updateBotState, updateGeneralBotState); 
        } else {
            let reason = '';
            if (!isRealBalanceSufficient) {
                reason = `Fondos REALES (${availableUSDT.toFixed(2)} USDT) insuficientes.`;
            } else if (!isCapitalLimitSufficient) {
                reason = `LÍMITE DE CAPITAL ASIGNADO (${currentLBalance.toFixed(2)} USDT) insuficiente.`;
            }

            log(`No se puede iniciar la orden. ${reason} Cambiando a NO_COVERAGE.`, 'warning');
            await updateBotState('NO_COVERAGE', 'long'); 
        }
    }
}

module.exports = { run };