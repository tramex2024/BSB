// BSB/server/src/au/states/short/SRunning.js (Espejo de LRunning.js)

const analyzer = require('../../../bitmart_indicator_analyzer');

async function run(dependencies) {
    const { botState, currentPrice, config, log, updateBotState } = dependencies;
    
    // 💡 1. VERIFICACIÓN DE POSICIÓN (Candado de Entrada Short)
    if (botState.sStateData.orderCountInCycle > 0) {
        log("Posición Short detectada (orderCountInCycle > 0). Transicionando a SELLING.", 'info');
        // Transición directa a SELLING para que maneje la posición existente.
        await updateBotState('SELLING', 'short'); 
        return; // Detener la ejecución de RUNNING
    }

    log("Estado Short: RUNNING. Esperando señal de entrada de VENTA (Short).", 'info');

    // Si no hay posición, procedemos con el análisis.
    const analysisResult = await analyzer.runAnalysis(currentPrice);

    if (analysisResult.action === 'SELL') { 
        log(`¡Señal de VENTA detectada! Razón: ${analysisResult.reason}`, 'success');
        
        // Simplemente transicionamos a SELLING para que este estado inicie el proceso de venta.
        log('Señal de VENTA recibida. Transicionando a SELLING para iniciar la orden Short.', 'info');
        await updateBotState('SELLING', 'short'); 
        
        // CRÍTICO: Detener este ciclo para que el bot pase a SELLING en la siguiente iteración.
        return; 
    }
}

module.exports = { run };