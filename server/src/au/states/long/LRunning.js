// BSB/server/src/au/states/long/LRunning.js

const MarketSignal = require('../../../../models/MarketSignal');

async function run(dependencies) {
    const { botState, log, updateBotState } = dependencies;
    
    // 1. VERIFICACIÓN DE SEGURIDAD (Anti-Duplicidad)
    // Si ya hay capital invertido (AC > 0), el bot debe estar gestionando la compra o venta.
    if (botState.lStateData && botState.lStateData.ac > 0) {
        log("[L-RUNNING] 🛡️ Detectada posición abierta. Corrigiendo estado a BUYING...", 'warning');
        await updateBotState('BUYING', 'long'); 
        return; 
    }

    // 2. CONSULTA DE SEÑAL GLOBAL
    try {
        // Usamos el símbolo desde la configuración (jerarquía corregida)
        const currentSymbol = botState.config?.symbol || 'BTC_USDT';
        const globalSignal = await MarketSignal.findOne({ symbol: currentSymbol });

        if (!globalSignal) {
            log("[L-RUNNING] ⏳ Esperando inicialización de señales de mercado...", 'debug');
            return;
        }

        // 3. VALIDACIÓN DE FRESCURA
        // Ajustado para usar 'lastUpdate' que es como lo guarda tu server.js
        const signalTime = globalSignal.lastUpdate || globalSignal.updatedAt;
        if (!signalTime) {
            log("[L-RUNNING] ⚠️ Señal sin marca de tiempo. Esperando actualización...", 'warning');
            return;
        }

        const signalAgeMinutes = (Date.now() - new Date(signalTime).getTime()) / 60000;
        
        if (signalAgeMinutes > 5) {
            log(`[L-RUNNING] ⚠️ Señal obsoleta (${signalAgeMinutes.toFixed(1)} min). Esperando actualización...`, 'warning');
            return;
        }

        // 4. LÓGICA DE ACTIVACIÓN
        if (globalSignal.signal === 'BUY') { 
            log(`🚀 [L-SIGNAL] ¡COMPRA DETECTADA! RSI: ${globalSignal.currentRSI.toFixed(2)}.`, 'success');
            
            // Transición inmediata a BUYING. 
            // LBuying.js se encargará de ejecutar la primera compra con los nuevos parámetros.
            await updateBotState('BUYING', 'long'); 
            return; 
        }

    } catch (error) {
        log(`[L-RUNNING] ❌ Error en lectura de señales: ${error.message}`, 'error');
    }
}

module.exports = { run };