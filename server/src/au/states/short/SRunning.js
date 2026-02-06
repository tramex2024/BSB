// BSB/server/src/au/states/short/SRunning.js

const MarketSignal = require('../../../../models/MarketSignal');

async function run(dependencies) {
    const { botState, log, updateBotState } = dependencies;
    
    // 1. VERIFICACIÓN DE SEGURIDAD (Posición huérfana)
    // Si hay acumulado de BTC (ac > 0), significa que ya vendimos (estamos en Short)
    // pero el estado se quedó en RUNNING por algún error o reinicio.
    if (botState.sStateData && botState.sStateData.ac > 0) {
        log("[S-RUNNING] 🛡️ Posición Short activa detectada (AC > 0). Corrigiendo estado a SELLING...", 'warning');
        await updateBotState('SELLING', 'short'); 
        return; 
    }

    // 2. CONSULTA DE SEÑAL GLOBAL
    try {
        const SYMBOL = botState.config.symbol || 'BTC_USDT';
        const globalSignal = await MarketSignal.findOne({ symbol: SYMBOL });

        if (!globalSignal) {
            return;
        }

        // 🟢 AÑADE ESTA LÍNEA PARA VISIBILIDAD:
        log(`[S-RUNNING] 👁️ RSI: ${globalSignal.currentRSI.toFixed(2)} | Tendencia: ${globalSignal.signal}`, 'debug');

        // 3. VALIDACIÓN DE TIEMPO REAL
        const signalAgeMinutes = (Date.now() - new Date(globalSignal.updatedAt).getTime()) / 60000;
        if (signalAgeMinutes > 5) {
            log(`[S-RUNNING] ⚠️ Señal de Short obsoleta (${signalAgeMinutes.toFixed(1)} min). Ignorando.`, 'warning');
            return;
        }

        // 4. LÓGICA DE ACTIVACIÓN (Señal de VENTA para iniciar SHORT)
        // El bot entra en Short cuando el RSI indica sobrecompra (SELL en la señal global)
        if (globalSignal.signal === 'SELL') { 
            log(`🚀 [S-SIGNAL] ¡OPORTUNIDAD DE SHORT DETECTADA! RSI: ${globalSignal.currentRSI.toFixed(2)}.`, 'success');
            
            /* IMPORTANTE: 
               Transicionamos a SELLING. 
               El archivo SSelling.js debe estar preparado para detectar que:
               si (botState.sStateData.ac === 0) -> Ejecutar la primera orden de venta
               usando botState.config.short.purchaseUsdt.
            */
            await updateBotState('SELLING', 'short'); 
            return; 
        }

    } catch (error) {
        log(`[S-RUNNING] ❌ Error en lectura de señales Short: ${error.message}`, 'error');
    }
}

module.exports = { run };