const MarketSignal = require('../../../../models/MarketSignal');

async function run(dependencies) {
    const { botState, log, updateBotState } = dependencies;
    
    // 1. SECURITY CHECK (Flat Architecture)
    // If lac > 0, the bot already has coins and must be in BUYING or SELLING.
    if (parseFloat(botState.lac || 0) > 0) {
        log("[L-RUNNING] 🛡️ Open position detected (lac > 0). Correcting state to BUYING...", 'warning');
        await updateBotState('BUYING', 'long'); 
        return; 
    }

    // 2. GLOBAL SIGNAL QUERY
    try {
        const currentSymbol = botState.config?.symbol || 'BTC_USDT';
        const globalSignal = await MarketSignal.findOne({ symbol: currentSymbol });

        if (!globalSignal) {
            log("[L-RUNNING] ⏳ Waiting for market signals initialization...", 'debug');
            return;
        }

        // 3. FRESHNESS VALIDATION
        const signalTime = globalSignal.lastUpdate || globalSignal.updatedAt;

        // Unified log format with emojis and bars
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

        // 4. ACTIVATION LOGIC (Market Entry)
        if (globalSignal.signal === 'BUY') { 
            log(`🚀 [L-SIGNAL] BUY DETECTED! RSI: ${globalSignal.currentRSI.toFixed(2)} | Entering Market...`, 'success');
            
            // Transition to BUYING so LBuying.js executes the first exponential order.
            await updateBotState('BUYING', 'long'); 
            return; 
        }

    } catch (error) {
        log(`[L-RUNNING] ❌ Error reading signals: ${error.message}`, 'error');
    }
}

module.exports = { run };