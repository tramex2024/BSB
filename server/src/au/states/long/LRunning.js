// BSB/server/src/au/states/long/LRunning.js

const MarketSignal = require('../../../../models/MarketSignal');

async function run(dependencies) {
    const { botState, log, updateBotState } = dependencies;
    
    // 1. VERIFICACIÓN DE SEGURIDAD (Arquitectura Plana)
    // ✅ CAMBIO: Ahora verificamos 'lac' directamente en la raíz.
    // Si lac > 0, significa que el bot ya tiene monedas compradas y debe estar en BUYING o SELLING.
    if (parseFloat(botState.lac || 0) > 0) {
        log("[L-RUNNING] 🛡️ Detectada posición abierta (lac > 0). Corrigiendo estado a BUYING...", 'warning');
        await updateBotState('BUYING', 'long'); 
        return; 
    }

    // 2. CONSULTA DE SEÑAL GLOBAL
    try {
        const currentSymbol = botState.config?.symbol || 'BTC_USDT';
        const globalSignal = await MarketSignal.findOne({ symbol: currentSymbol });

        if (!globalSignal) {
            log("[L-RUNNING] ⏳ Esperando inicialización de señales de mercado...", 'debug');
            return;
        }

        // 3. VALIDACIÓN DE FRESCURA
        const signalTime = globalSignal.lastUpdate || globalSignal.updatedAt;

        // Log informativo para el dashboard
        log(`[L-RUNNING] 👁️ RSI: ${globalSignal.currentRSI.toFixed(2)} | Tendencia: ${globalSignal.signal}`, 'debug');

        if (!signalTime) {
            log("[L-RUNNING] ⚠️ Señal sin marca de tiempo. Esperando actualización...", 'warning');
            return;
        }

        const signalAgeMinutes = (Date.now() - new Date(signalTime).getTime()) / 60000;
        
        if (signalAgeMinutes > 5) {
            log(`[L-RUNNING] ⚠️ Señal obsoleta (${signalAgeMinutes.toFixed(1)} min). Esperando actualización...`, 'warning');
            return;
        }

        // 4. LÓGICA DE ACTIVACIÓN (Entrada al mercado)
        if (globalSignal.signal === 'BUY') { 
            log(`🚀 [L-SIGNAL] ¡COMPRA DETECTADA! RSI: ${globalSignal.currentRSI.toFixed(2)}.`, 'success');
            
            // Transición a BUYING para que LBuying.js ejecute la primera orden exponencial.
            await updateBotState('BUYING', 'long'); 
            return; 
        }

    } catch (error) {
        log(`[L-RUNNING] ❌ Error en lectura de señales: ${error.message}`, 'error');
    }
}

module.exports = { run };