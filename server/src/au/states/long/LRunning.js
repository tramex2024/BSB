const MarketSignal = require('../../../../models/MarketSignal');
const { calculateLongCoverage } = require('../../../../autobotCalculations');

/**
 * RUNNING STATE (LONG):
 * Estado de espera activa. Busca señales de compra para iniciar el ciclo.
 */
async function run(dependencies) {
    const { 
        userId, 
        botState, 
        log, 
        updateBotState, 
        currentPrice, 
        updateGeneralBotState,
        config 
    } = dependencies;
    
    // 1. SECURITY CHECK (Flat Architecture)
    if (parseFloat(botState.lac || 0) > 0) {
        log("[L-RUNNING] 🛡️ Open position detected (lac > 0). Correcting state to BUYING...", 'warning');
        await updateBotState('BUYING', 'long'); 
        return; 
    }

    // --- NUEVO: ACTUALIZACIÓN DE PROYECCIÓN VISUAL ---
    // Mientras esperamos la señal, actualizamos el Dashboard con lo que pasaría
    // si entráramos en este preciso segundo.
    const coverageInfo = calculateLongCoverage(
        parseFloat(botState.lbalance || 0),
        currentPrice, // Base real de mercado
        config.long.purchaseUsdt,
        (config.long.price_var / 100),
        parseFloat(config.long.size_var || 0),
        0, // Empezamos desde la orden 0
        (config.long.price_step_inc / 100)
    );

    await updateGeneralBotState({ 
        lcoverage: coverageInfo.coveragePrice,
        lnorder: coverageInfo.numberOfOrders
    });

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
            await updateBotState('BUYING', 'long'); 
            return; 
        }

    } catch (error) {
        log(`[L-RUNNING] ❌ Error reading signals: ${error.message}`, 'error');
    }
}

module.exports = { run };