// BSB/server/src/au/states/short/SRunning.js

const MarketSignal = require('../../../../models/MarketSignal');

async function run(dependencies) {
    const { botState, log, updateBotState } = dependencies;
    
    // 1. VERIFICACIÓN DE SEGURIDAD (Posición huérfana)
    // Si hay deuda de BTC (ac > 0), el bot debe estar gestionando la venta/cobertura.
    if (botState.sStateData && botState.sStateData.ac > 0) {
        log("[S-RUNNING] 🛡️ Posición Short activa detectada. Corrigiendo estado a SELLING...", 'warning');
        await updateBotState('SELLING', 'short'); 
        return; 
    }

    // 2. CONSULTA DE SEÑAL GLOBAL
    try {
        const SYMBOL = botState.config.symbol || 'BTC_USDT';
        const globalSignal = await MarketSignal.findOne({ symbol: SYMBOL });

        if (!globalSignal) {
            log("[S-RUNNING] ⏳ Esperando señales del servidor para Short...", 'debug');
            return;
        }

        // 3. VALIDACIÓN DE TIEMPO REAL (Seguridad ante latencia)
        const signalAgeMinutes = (Date.now() - new Date(globalSignal.updatedAt).getTime()) / 60000;
        if (signalAgeMinutes > 5) {
            log(`[S-RUNNING] ⚠️ Señal de Short obsoleta (${signalAgeMinutes.toFixed(1)} min). Ignorando.`, 'warning');
            return;
        }

        log(`[S-RUNNING] 👁️ RSI: ${globalSignal.currentRSI.toFixed(2)} | Señal: ${globalSignal.signal}`, 'debug');

        // 4. LÓGICA DE ACTIVACIÓN (Sobrecompra)
        if (globalSignal.signal === 'SELL') { 
            log(`🚀 [S-SIGNAL] ¡OPORTUNIDAD DE SHORT! RSI: ${globalSignal.currentRSI.toFixed(2)}.`, 'success');
            
            // Transicionamos a SELLING. 
            // SSelling.js verá que ac=0 y disparará la placeFirstShortOrder.
            await updateBotState('SELLING', 'short'); 
            return; 
        }

    } catch (error) {
        log(`[S-RUNNING] ❌ Error en lectura de señales Short: ${error.message}`, 'error');
    }
}

module.exports = { run };