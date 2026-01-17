// BSB/server/src/au/states/short/SRunning.js

const MarketSignal = require('../../../../models/MarketSignal');

async function run(dependencies) {
    const { botState, log, updateBotState, currentPrice } = dependencies;
    
    // 0. BLOQUEO PREVENTIVO: Seguridad contra precio 0
    if (!currentPrice || currentPrice <= 0) {
        return; 
    }

    // 1. VERIFICACIÓN DE SEGURIDAD (Posición huérfana)
    // Acceso seguro a sStateData
    const sStateData = botState.sStateData || {};
    if (sStateData.ac > 0) {
        log("[S-RUNNING] 🛡️ Posición Short activa detectada. Corrigiendo estado...", 'warning');
        await updateBotState('SELLING', 'short'); 
        return; 
    }

    try {
        // Acceso seguro al símbolo desde la nueva estructura config
        const SYMBOL = botState.config?.symbol || 'BTC_USDT';
        const globalSignal = await MarketSignal.findOne({ symbol: SYMBOL });

        if (!globalSignal) return;

        // 2. LOG DE MONITOREO (Heartbeat)
        // Se mantiene el log de debug para ver el RSI en tiempo real
        log(`[S-RUNNING] 👁️ RSI: ${globalSignal.currentRSI.toFixed(2)} | Tendencia: ${globalSignal.signal} | BTC: ${currentPrice.toFixed(2)}`, 'debug');

        // 3. VALIDACIÓN DE TIEMPO REAL
        const signalAgeMinutes = (Date.now() - new Date(globalSignal.updatedAt).getTime()) / 60000;
        if (signalAgeMinutes > 5) {
            log(`[S-RUNNING] ⚠️ Señal de Short obsoleta (${signalAgeMinutes.toFixed(1)} min). Ignorando.`, 'warning');
            return;
        }

        // 4. LÓGICA DE ACTIVACIÓN
        // Si el RSI indica sobrecompra o señal de venta (SELL), entramos en Short
        if (globalSignal.signal === 'SELL') { 
            log(`🚀 [S-SIGNAL] ¡OPORTUNIDAD DE SHORT DETECTADA! RSI: ${globalSignal.currentRSI.toFixed(2)}.`, 'success');
            // En Short, el estado de operación activa suele ser SELLING
            await updateBotState('SELLING', 'short'); 
            return; 
        }

    } catch (error) {
        log(`[S-RUNNING] ❌ Error en señales: ${error.message}`, 'error');
    }
}

module.exports = { run };