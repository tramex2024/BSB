// BSB/server/src/au/states/short/SRunning.js

const MarketSignal = require('../../../../models/MarketSignal');

async function run(dependencies) {
    const { botState, log, updateBotState, currentPrice } = dependencies;
    
    // 0. BLOQUEO PREVENTIVO: Si no hay precio del WebSocket, no hacemos nada
    if (!currentPrice || currentPrice <= 0) {
        return; // Esperamos al siguiente tick con precio válido
    }

    if (botState.sStateData && botState.sStateData.ac > 0) {
        log("[S-RUNNING] 🛡️ Posición Short activa detectada. Corrigiendo estado...", 'warning');
        await updateBotState('SELLING', 'short'); 
        return; 
    }

    try {
        const SYMBOL = botState.config.symbol || 'BTC_USDT';
        const globalSignal = await MarketSignal.findOne({ symbol: SYMBOL });

        if (!globalSignal) return;

        const signalAgeMinutes = (Date.now() - new Date(globalSignal.updatedAt).getTime()) / 60000;
        if (signalAgeMinutes > 5) {
            log(`[S-RUNNING] ⚠️ Señal de Short obsoleta. Ignorando.`, 'warning');
            return;
        }

        if (globalSignal.signal === 'SELL') { 
            log(`🚀 [S-SIGNAL] OPORTUNIDAD SHORT: RSI ${globalSignal.currentRSI.toFixed(2)}.`, 'success');
            await updateBotState('SELLING', 'short'); 
            return; 
        }

    } catch (error) {
        log(`[S-RUNNING] ❌ Error en señales: ${error.message}`, 'error');
    }
}

module.exports = { run };