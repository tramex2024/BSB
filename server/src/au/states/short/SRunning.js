//BSB/server/src/au/states/short/SRunning.js

/**
 * S-RUNNING STATE (SHORT):
 * Monitorea señales de mercado para abrir una posición en corto.
 */

const MarketSignal = require('../../../../models/MarketSignal');

async function run(dependencies) {
    // 1. Contexto inyectado
    const { userId, botState, log, updateBotState, currentPrice } = dependencies;
    
    // 0. Bloqueo de seguridad: Precio inválido
    if (!currentPrice || currentPrice <= 0) return; 

    // 1. VERIFICACIÓN DE POSICIÓN HUÉRFANA
    // Si ya hay activos en 'sac', debemos estar gestionando la venta, no buscando señal.
    const currentAC = parseFloat(botState.sac || 0); 
    
    if (currentAC > 0) {
        log("[S-RUNNING] 🛡️ Posición Short activa detectada (sac > 0). Corrigiendo estado a SELLING...", 'warning');
        await updateBotState('SELLING', 'short'); 
        return; 
    }

    try {
        // 2. CONSULTA DE SEÑALES GLOBALES
        const SYMBOL = botState.config?.symbol || 'BTC_USDT';
        const globalSignal = await MarketSignal.findOne({ symbol: SYMBOL });

        if (!globalSignal) return;

        // Log de monitoreo (Heartbeat) filtrado por userId
        log(`[S-RUNNING] 👁️ RSI: ${globalSignal.currentRSI.toFixed(2)} | Signal: ${globalSignal.signal} | BTC: ${currentPrice.toFixed(2)}`, 'debug');

        // 3. VALIDACIÓN DE OBSOLESCENCIA
        const signalAgeMinutes = (Date.now() - new Date(globalSignal.lastUpdate || globalSignal.updatedAt).getTime()) / 60000;
        if (signalAgeMinutes > 5) {
            log(`[S-RUNNING] ⚠️ Señal Short obsoleta (${signalAgeMinutes.toFixed(1)} min). Ignorando.`, 'warning');
            return;
        }

        // 4. LÓGICA DE ACTIVACIÓN
        // En Short, entramos cuando la señal es 'SELL' (el mercado está arriba y esperamos que baje)
        if (globalSignal.signal === 'SELL') { 
            log(`🚀 [S-SIGNAL] ¡OPORTUNIDAD DE SHORT DETECTADA! RSI: ${globalSignal.currentRSI.toFixed(2)}.`, 'success');
            
            // Pasamos a SELLING para ejecutar la primera venta de apertura
            await updateBotState('SELLING', 'short'); 
            return; 
        }

    } catch (error) {
        log(`[S-RUNNING] ❌ Error en señales: ${error.message}`, 'error');
    }
}

module.exports = { run };