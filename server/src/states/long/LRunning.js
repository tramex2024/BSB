const analyzer = require('../../bitmart_indicator_analyzer');
// 🛑 Eliminamos la dependencia de placeFirstBuyOrder

async function run(dependencies) {
    const { botState, currentPrice, availableUSDT, config, log, updateBotState } = dependencies;
    
    // 💡 1. VERIFICACIÓN DE POSICIÓN (Si ya hay una posición, transicionar a BUYING para su gestión)
    // Usamos AC > 0 como indicador principal de una posición abierta.
    if (botState.lStateData.AC > 0) {
        log("Posición detectada (AC > 0). Transicionando a BUYING para su gestión.", 'info');
        await updateBotState('BUYING', 'long'); 
        return; // Detener la ejecución de RUNNING
    }

    log("Estado Long: RUNNING. Esperando señal de entrada de COMPRA.", 'info');

    // Si no hay posición, procedemos con el análisis.
    const analysisResult = await analyzer.runAnalysis(currentPrice);

    if (analysisResult.action === 'BUY') { 
        log(`¡Señal de COMPRA detectada! Razón: ${analysisResult.reason}`, 'success');
        
        // 🚨 CRÍTICO: Usamos la constante de BitMart (Asumimos que está definida o importada)
        const MIN_USDT_VALUE_FOR_BITMART = 5.00; 
        const purchaseAmount = parseFloat(config.long.purchaseUsdt);
        
        // ⚠️ VERIFICACIÓN DEL LÍMITE DE CAPITAL (LBalance)
        const currentLBalance = parseFloat(botState.lbalance || 0);

        const isRealBalanceSufficient = availableUSDT >= purchaseAmount && purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART;
        const isCapitalLimitSufficient = currentLBalance >= purchaseAmount;
        
        if (isRealBalanceSufficient && isCapitalLimitSufficient) {
            
            log('Condiciones de capital y señal cumplidas. Transicionando a BUYING para colocar la orden inicial.', 'success');
            
            // 🎯 ACCIÓN CLAVE: SOLO TRANSICIONAR EL ESTADO
            // LBuying.js se encargará de llamar a placeFirstBuyOrder en el siguiente ciclo.
            await updateBotState('BUYING', 'long'); 
            
            return; 
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