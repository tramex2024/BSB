/**
 * BSB/server/src/aiStrategy.js
 * Final Version: Optimized adapter without telemetry redundancy.
 * Protegido contra desconexiones temporales de red/DNS (2026).
 */

const aiEngine = require('./states/ai/AIEngine');

// 🟢 Helper estandarizado para detectar errores temporales de red/DNS
const isNetworkError = (err) => {
    const msg = err?.message || '';
    return err?.code === 'ENOTFOUND' || 
           err?.code === 'ETIMEDOUT' || 
           err?.code === 'ECONNRESET' || 
           msg.includes('ENOTFOUND') || 
           msg.includes('Request Failed') ||
           msg.includes('Network');
};

async function runAIStrategy(dependencies) {
    // 1. Integrity verification (Fail-fast)
    if (!dependencies || !dependencies.botState || !dependencies.currentPrice || !dependencies.userId) {
        return;
    }

    const { 
        currentPrice, 
        botState, 
        userId, 
        log, 
        marketContext, // Clean data coming from MarketSignal
        placeAIOrder,           
        updateBotState          
    } = dependencies;

    const currentState = botState.aistate || 'STOPPED';

    try {
        // 2. Operational state filter
        if (currentState === 'STOPPED') return;

        /**
         * 3. Centralized strategic execution
         * Pass marketContext directly from MarketSignal so AIEngine 
         * makes immediate analytical decisions without recalculating anything.
         */
        await aiEngine.analyze(currentPrice, userId, {
            botState,
            marketContext, 
            placeAIOrder,
            updateBotState,
            log,
            syncFrontendState: dependencies.syncFrontendState 
        });

    } catch (error) {
        if (log) log(`❌ [AI-STRATEGY-ERROR]: ${error.message}`, 'error');
        console.error(`[AI-STRATEGY][User: ${userId}]:`, error);

        // [Panic Mitigation]
        // 🟢 Solo forzar la pausa de emergencia si NO fue un error temporal de red/DNS
        if (!isNetworkError(error) && currentState === 'RUNNING') {
            try {
                log(`🚨 [AI FALLBACK] Emergency pause activated due to engine exception.`, 'warning');
                await updateBotState('PAUSED', 'ai');
            } catch (fallbackError) {
                console.error(`💥 Critical failure in AI panic mitigation for user ${userId}:`, fallbackError.message);
            }
        }
    }
}

module.exports = { runAIStrategy };