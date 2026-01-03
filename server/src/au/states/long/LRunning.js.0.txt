// BSB/server/src/au/states/long/LRunning.js (ETAPA 1: Detector de Señal)

const analyzer = require('../../../bitmart_indicator_analyzer');
// Se elimina la dependencia de placeFirstBuyOrder

async function run(dependencies) {
    const { botState, currentPrice, config, log, updateBotState } = dependencies;
    
    // 💡 1. VERIFICACIÓN DE POSICIÓN (Candado de Entrada)
    if (botState.lStateData.orderCountInCycle > 0) {
        log("Posición detectada (orderCountInCycle > 0). Transicionando a BUYING.", 'info');
        // Transición directa a BUYING para que maneje la posición existente.
        await updateBotState('BUYING', 'long'); 
        return; // Detener la ejecución de RUNNING
    }

    log("[L]: RUNNING. Esperando señal de compra.", 'info');

    // Si no hay posición, procedemos con el análisis.
    const analysisResult = await analyzer.runAnalysis(currentPrice);

    if (analysisResult.action === 'BUY') { 
        log(`¡Señal de COMPRA detectada! Razón: ${analysisResult.reason}`, 'success');
        
        // 🛑 CAMBIO CRÍTICO: Eliminamos toda la lógica de validación de fondos y colocación de orden.
        // Simplemente transicionamos a BUYING para que este estado inicie el proceso de compra.
        log('Señal de COMPRA recibida. Transicionando a BUYING para iniciar la orden.', 'info');
        await updateBotState('BUYING', 'long'); 
        
        // CRÍTICO: Detener este ciclo para que el bot pase a BUYING en la siguiente iteración.
        return; 
    }
}

module.exports = { run };