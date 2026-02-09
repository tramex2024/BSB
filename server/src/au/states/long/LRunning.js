const MarketSignal = require('../../../../models/MarketSignal');

/**
 * RUNNING STATE (LONG):
 * Estado de espera activa. Busca señales de compra para iniciar el ciclo.
 */
async function run(dependencies) {
    // 1. Extraemos userId de las dependencias inyectadas por autobotLogic
    // IMPORTANTE: userId ya viene como el String/ID puro (ej: 698808...)
    const { userId, botState, log, updateBotState } = dependencies;
    
    // 2. SECURITY CHECK (Flat Architecture)
    // Si ya hay balance (lac > 0), el bot debe estar gestionando la posición.
    if (parseFloat(botState.lac || 0) > 0) {
        log("[L-RUNNING] 🛡️ Open position detected (lac > 0). Correcting state to BUYING...", 'warning');
        await updateBotState('BUYING', 'long'); 
        return; 
    }

    // 3. GLOBAL SIGNAL QUERY
    try {
        const currentSymbol = botState.config?.symbol || 'BTC_USDT';
        const globalSignal = await MarketSignal.findOne({ symbol: currentSymbol });

        if (!globalSignal) {
            log("[L-RUNNING] ⏳ Waiting for market signals initialization...", 'debug');
            return;
        }

        // 4. FRESHNESS VALIDATION
        const signalTime = globalSignal.lastUpdate || globalSignal.updatedAt;

        // REPARADO: El log inyectado ya emite a la sala del userId sin prefijos.
        log(`[L-RUNNING] 👁️ RSI: ${globalSignal.currentRSI.toFixed(2)} | Signal: ${globalSignal.signal}`, 'debug');

        if (!signalTime) {
            log("[L-RUNNING] ⚠️ Signal without timestamp. Waiting for update...", 'warning');
            return;
        }

        const signalAgeMinutes = (Date.now() - new Date(signalTime).getTime()) / 60000;
        
        if (signalAgeMinutes > 5) {
            log(`[L-RUNNING] ⚠️ Obsolete signal (${signalAgeMinutes.toFixed(1)} min). Waiting for update...`, 'warning');
            return;
        }

        // 5. ACTIVATION LOGIC (Market Entry)
        // Solo si la señal es BUY, cambiamos el estado para que LBuying tome el control.
        if (globalSignal.signal === 'BUY') { 
            log(`🚀 [L-SIGNAL] BUY DETECTED! RSI: ${globalSignal.currentRSI.toFixed(2)} | Entering Market...`, 'success');
            
            // Transición a BUYING: LBuying.js ejecutará la primera orden exponencial.
            await updateBotState('BUYING', 'long'); 
            return; 
        }

    } catch (error) {
        // El aislamiento asegura que este error no tire el bot de otros usuarios
        log(`[L-RUNNING] ❌ Error reading signals: ${error.message}`, 'error');
    }
}

module.exports = { run };