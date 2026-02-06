const MarketSignal = require('../../../../models/MarketSignal');

async function run(dependencies) {
    const { botState, log, updateBotState, currentPrice } = dependencies;
    
    // 0. PREVENTIVE BLOCK: Security against price 0
    if (!currentPrice || currentPrice <= 0) {
        return; 
    }

    // 1. SECURITY CHECK (Orphan Position)
    // ✅ MIGRATED: Directly reading 'sac' from root
    const currentAC = parseFloat(botState.sac || 0); 
    
    if (currentAC > 0) {
        log("[S-RUNNING] 🛡️ Active Short position detected (sac > 0). Correcting state to SELLING...", 'warning');
        await updateBotState('SELLING', 'short'); 
        return; 
    }

    try {
        // Access symbol from config structure
        const SYMBOL = botState.config?.symbol || 'BTC_USDT';
        const globalSignal = await MarketSignal.findOne({ symbol: SYMBOL });

        if (!globalSignal) return;

        // 2. MONITORING LOG (Heartbeat) - Unified Format
        log(`[S-RUNNING] 👁️ RSI: ${globalSignal.currentRSI.toFixed(2)} | Signal: ${globalSignal.signal} | BTC: ${currentPrice.toFixed(2)}`, 'debug');

        // 3. REAL-TIME VALIDATION
        const signalAgeMinutes = (Date.now() - new Date(globalSignal.lastUpdate || globalSignal.updatedAt).getTime()) / 60000;
        if (signalAgeMinutes > 5) {
            log(`[S-RUNNING] ⚠️ Obsolete Short signal (${signalAgeMinutes.toFixed(1)} min). Ignoring.`, 'warning');
            return;
        }

        // 4. ACTIVATION LOGIC
        // If RSI indicates overbought or SELL signal, we enter Short
        if (globalSignal.signal === 'SELL') { 
            log(`🚀 [S-SIGNAL] SHORT OPPORTUNITY DETECTED! RSI: ${globalSignal.currentRSI.toFixed(2)}.`, 'success');
            // Transition to SELLING so SSelling.js takes control and executes the first order
            await updateBotState('SELLING', 'short'); 
            return; 
        }

    } catch (error) {
        log(`[S-RUNNING] ❌ Signals Error: ${error.message}`, 'error');
    }
}

module.exports = { run };