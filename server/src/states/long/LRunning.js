// BSB/server/src/states/long/LRunning.js (CORREGIDO - Prioriza Posición y Doble Chequeo)

const analyzer = require('../../bitmart_indicator_analyzer');
const { placeFirstBuyOrder } = require('../../utils/orderManager');

async function run(dependencies) {
    const { botState, currentPrice, availableUSDT, config, creds, log, updateBotState, updateGeneralBotState } = dependencies;
    
    // 💡 1. VERIFICACIÓN DE POSICIÓN (PRIORIDAD AL INICIO)
    // Si ya se colocó la primera orden, pasamos inmediatamente a BUYING.
    if (botState.lStateData.orderCountInCycle > 0) {
        log("Posición detectada (orderCountInCycle > 0). Transicionando a BUYING.", 'info');
        // Asumiendo que updateBotState también maneja la lógica de salir del ciclo para RUNNING
        await updateBotState('BUYING', 'long'); 
        return; // Detener la ejecución de RUNNING
    }

    log("Estado Long: RUNNING. Esperando señal de entrada de COMPRA.", 'info');

    // Si no hay posición, procedemos con el análisis.
    const analysisResult = await analyzer.runAnalysis(currentPrice);

    if (analysisResult.action === 'BUY') {
        log(`¡Señal de COMPRA detectada! Razón: ${analysisResult.reason}`, 'success');
        
        // 💡 2. RED DE SEGURIDAD (DOBLE CHEQUEO)
        // Volvemos a verificar el contador de órdenes justo antes de comprar.
        if (botState.lStateData.orderCountInCycle > 0) {
            log('Red de seguridad activada: orderCountInCycle ya es > 0, cancelando compra duplicada.', 'warning');
            await updateBotState('BUYING', 'long');
            return;
        }

        const purchaseAmount = parseFloat(config.long.purchaseUsdt);
        const MIN_USDT_VALUE_FOR_BITMART = 5.00;
        
        // ⚠️ VERIFICACIÓN DEL LÍMITE DE CAPITAL (LBalance)
        const currentLBalance = parseFloat(botState.lbalance || 0);

        const isRealBalanceSufficient = availableUSDT >= purchaseAmount && purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART;
        const isCapitalLimitSufficient = currentLBalance >= purchaseAmount;
        
        if (isRealBalanceSufficient && isCapitalLimitSufficient) {
            // Llama a la función y pasa log y updateBotState
            // NOTA: placeFirstBuyOrder ahora se encargará de actualizar orderCountInCycle a 1 y pasar a BUYING.
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