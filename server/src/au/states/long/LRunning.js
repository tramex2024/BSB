// BSB/server/src/au/states/long/LRunning.js

const MarketSignal = require('../../../../models/MarketSignal');

async function run(dependencies) {
    const { botState, log, updateBotState } = dependencies;
    
    // 1. VERIFICACIÓN DE SEGURIDAD (Anti-Duplicidad)
    // Si ya hay capital invertido (AC > 0), el bot nunca debería estar en RUNNING.
    if (botState.lStateData && botState.lStateData.ac > 0) {
        log("[L-RUNNING] 🛡️ Detectada posición abierta. Corrigiendo estado a BUYING...", 'warning');
        await updateBotState('BUYING', 'long'); 
        return; 
    }

    // 2. CONSULTA DE SEÑAL GLOBAL
    try {
        const globalSignal = await MarketSignal.findOne({ symbol: botState.config.symbol || 'BTC_USDT' });

        if (!globalSignal) {
            log("[L-RUNNING] ⏳ Esperando inicialización de señales de mercado...", 'debug');
            return;
        }

        // 3. VALIDACIÓN DE FRESCURA (Opcional pero Recomendado)
        // Si la señal tiene más de 5 minutos, la ignoramos por seguridad (latencia de red)
        const signalAgeMinutes = (Date.now() - new Date(globalSignal.updatedAt).getTime()) / 60000;
        if (signalAgeMinutes > 5) {
            log(`[L-RUNNING] ⚠️ Señal obsoleta (${signalAgeMinutes.toFixed(1)} min). Esperando actualización...`, 'warning');
            return;
        }

        // Log informativo para el dashboard
        log(`[L-RUNNING] 👁️ RSI: ${globalSignal.currentRSI.toFixed(2)} | Tendencia: ${globalSignal.signal}`, 'debug');

        // 4. LÓGICA DE ACTIVACIÓN
        if (globalSignal.signal === 'BUY') { 
            log(`🚀 [L-SIGNAL] ¡COMPRA DETECTADA! RSI en zona: ${globalSignal.currentRSI.toFixed(2)}.`, 'success');
            
            // Transición inmediata a BUYING. 
            // El archivo LBuying.js detectará que no hay órdenes y disparará la primera compra.
            await updateBotState('BUYING', 'long'); 
            return; 
        }

    } catch (error) {
        log(`[L-RUNNING] ❌ Error al leer pizarra de señales: ${error.message}`, 'error');
    }
}

module.exports = { run };