// BSB/server/src/states/short/SRunning.js

/**
 * S-RUNNING STATE (SHORT):
 * Monitors market signals to open a short position.
 * Fixed: Real-time visual projection synchronization (2026).
 */

const MarketSignal = require('../../../models/MarketSignal');
const { calculateShortCoverage } = require('../../../autobotCalculations');

async function run(dependencies) {
    // 1. Injected Context
    const { 
        userId, 
        botState, 
        log, 
        updateBotState, 
        currentPrice, 
        updateGeneralBotState,
        config,
        marketContext // 🟢 AUDIT: Received optimized context injected from the master engine
    } = dependencies;
    
    // 0. Safety Lock: Invalid Price
    if (!currentPrice || currentPrice <= 0) return; 

    // 1. ORPHAN POSITION CHECK
    // 🟢 AUDIT: If the user already has sold assets (sac > 0), the bot must manage the position.
    // This prevents the bot from ignoring an open debt if the state becomes desynchronized.
    const currentAC = parseFloat(botState.sac || 0); 
    
    if (currentAC > 0) {
//         log("[S-RUNNING] 🛡️ Active Short position detected (sac > 0). Correcting state to SELLING...", 'warning');
        await updateBotState('SELLING', 'short'); 
        return; 
    }

    // --- NEW: SHORT VISUAL PROJECTION UPDATE ---
    // Project the protection ceiling (scoverage) based on the current price
    // while waiting for the entry signal.
    // 🟢 AUDIT: The calculation is 100% atomic per user using their sbalance and config.
    const coverageInfo = calculateShortCoverage(
        parseFloat(botState.sbalance || 0),
        currentPrice, // Real market base for Short
        config.short.purchaseUsdt,
        (config.short.price_var / 100),
        parseFloat(config.short.size_var || 0),
        0, // Initial order
        (config.short.price_step_inc / 100)
    );

    await updateGeneralBotState({ 
        scoverage: coverageInfo.coveragePrice,
        snorder: coverageInfo.numberOfOrders
    });

    try {
        // 2. GLOBAL SIGNALS QUERY
        const SYMBOL = botState.config?.symbol || 'BTC_USDT';
        
        // Obtenemos la señal de la DB primero como fuente de verdad
        const dbSignal = await MarketSignal.findOne({ symbol: SYMBOL });
        
        // Evaluamos: si la inyección atómica (marketContext) es nueva, la usamos, 
        // pero si hay discrepancia, priorizamos la base de datos.
        let globalSignal = dbSignal; 
        
        if (marketContext && marketContext.lastUpdate && dbSignal) {
             const contextTime = new Date(marketContext.lastUpdate).getTime();
             const dbTime = new Date(dbSignal.lastUpdate).getTime();
             
             // Si el contexto es más reciente, lo usamos, si no, usamos la DB
             if (contextTime > dbTime) {
                 globalSignal = marketContext;
             }
        }

        if (!globalSignal) return;

        // DEBUG LOG PARA VER SI REALMENTE ES 'SELL'
        log(`[DEBUG] Signal Source: ${globalSignal.signal ? 'Valid' : 'Invalid'} | Value: "${globalSignal.signal}"`, 'debug');

        const rsiValue = globalSignal.currentRSI ?? globalSignal.rsi14 ?? 50;

        (globalSignal.rsi14 !== undefined ? globalSignal.rsi14 : 50);

        // Monitoring log (Heartbeat)
        log(`[S-RUNNING] 👁️ RSI: ${rsiValue.toFixed(2)} | Signal: ${globalSignal.signal} | BTC: ${currentPrice.toFixed(2)}`, 'debug');

        // 3. OBSOLESCENCE VALIDATION
        // 🟢 AUDIT: Vital to avoid false entries if the signaling service (MarketSignal) freezes.
        const signalTime = globalSignal.lastUpdate || globalSignal.updatedAt;

        if (!signalTime) {
            return;
        }

        const signalAgeMinutes = (Date.now() - new Date(signalTime).getTime()) / 60000;
        if (signalAgeMinutes > 5) {
//             log(`[S-RUNNING] ⚠️ Obsolete Short signal (${signalAgeMinutes.toFixed(1)} min). Ignoring.`, 'warning');
            return;
        }

        // 4. ACTIVATION LOGIC (Market Entry)
        if (globalSignal.signal === 'SELL') { 
            log(`🚀 [S-SIGNAL] SHORT OPPORTUNITY DETECTED! RSI: ${rsiValue.toFixed(2)}.`, 'success');
            
            // Move to SELLING to execute the first opening sale (Debt creation)
            await updateBotState('SELLING', 'short'); 
            return; 
        }

    } catch (error) {
        log(`[S-RUNNING] ❌ Signals error: ${error.message}`, 'error');
    }
}

module.exports = { run };