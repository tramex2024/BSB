// BSB/server/src/au/states/short/SRunning.js

const MarketSignal = require('../../../../models/MarketSignal');

async function run(dependencies) {
    const { botState, log, updateBotState, currentPrice } = dependencies;
    
    // 0. BLOQUEO PREVENTIVO: Seguridad contra precio 0
    if (!currentPrice || currentPrice <= 0) {
        return; 
    }

    // 1. VERIFICACIÓN DE SEGURIDAD (Posición huérfana)
    if (botState.sStateData && botState.sStateData.ac > 0) {
        log("[S-RUNNING] 🛡️ Posición Short activa detectada. Corrigiendo estado...", 'warning');
        await updateBotState('SELLING', 'short'); 
        return; 
    }

    try {
        const SYMBOL = botState.config.symbol || 'BTC_USDT';
        const globalSignal = await MarketSignal.findOne({ symbol: SYMBOL });

        if (!globalSignal) return;

        // 🟢 EL LOG DEL OJITO (REINSTAURADO):
        // Ahora es seguro porque ya validamos que hay currentPrice arriba.
        log(`[S-RUNNING] 👁️ RSI: ${globalSignal.currentRSI.toFixed(2)} | Tendencia: ${globalSignal.signal} | BTC: ${currentPrice.toFixed(2)}`, 'debug');

        // 3. VALIDACIÓN DE TIEMPO REAL
        const signalAgeMinutes = (Date.now() - new Date(globalSignal.updatedAt).getTime()) / 60000;
        if (signalAgeMinutes > 5) {
            log(`[S-RUNNING] ⚠️ Señal de Short obsoleta (${signalAgeMinutes.toFixed(1)} min). Ignorando.`, 'warning');
            return;
        }

        // 4. LÓGICA DE ACTIVACIÓN
        if (globalSignal.signal === 'SELL') { 
            log(`🚀 [S-SIGNAL] ¡OPORTUNIDAD DE SHORT DETECTADA! RSI: ${globalSignal.currentRSI.toFixed(2)}.`, 'success');
            await updateBotState('SELLING', 'short'); 
            return; 
        }

    } catch (error) {
        log(`[S-RUNNING] ❌ Error en señales: ${error.message}`, 'error');
    }
}

module.exports = { run };