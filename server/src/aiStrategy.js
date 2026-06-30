/**
 * BSB/server/src/aiStrategy.js
 * Optimized Version: Adapter that injects MarketContext into the AI Engine
 */

const aiEngine = require('./states/ai/AIEngine');

async function runAIStrategy(dependencies) {
    // 1. Integrity validation (Fail-fast)
    if (!dependencies || !dependencies.botState || !dependencies.currentPrice || !dependencies.userId) {
        return;
    }

    const { 
        currentPrice, 
        botState, 
        userId, 
        log, 
        marketContext, // <--- NEW: Access to the single source of truth
        placeAIOrder,           
        updateAIStateData,      
        updateBotState          
    } = dependencies;

    const currentState = botState.aistate || 'STOPPED';

    try {
        // 2. OPERATIONAL STATE FILTER
        if (currentState === 'STOPPED') return;

        /**
         * 3. EXECUTION BASED ON CENTRALIZED CONTEXT
         * We pass the marketContext so the AIEngine doesn't waste time calculating,
         * only evaluates the decision strategy.
         */
        await aiEngine.analyze(currentPrice, userId, {
            botState,
            marketContext, // <--- INJECTION OF GLOBAL MARKET STATE
            placeAIOrder,
            updateAIStateData,
            updateBotState,
            log,
            syncFrontendState: dependencies.syncFrontendState 
        });

    // 🟢 DATA BRIDGE: Syncs market indicators to BotState
    await updateAIStateData({
        lac: marketContext.stochK || marketContext.stoch || 0, // Mapping to 'lac' (the ID your UI expects)
        lai: marketContext.adx || 0,                          // Mapping to 'lai' (the ID your UI expects)
        aiRsi: marketContext.rsi14 || 0,
        aiMacd: marketContext.macdValue || 0
    });

    } catch (error) {
        if (log) log(`❌ [AI-STRATEGY-ERROR]: ${error.message}`, 'error');
        console.error(`[AI-STRATEGY][User: ${userId}]:`, error);

        // [SAFETY FALLBACK]
        if (currentState === 'RUNNING') {
            try {
                log(`🚨 [FALLBACK AI] Emergency pause due to Engine error.`, 'warning');
                await updateBotState('PAUSED', 'ai');
            } catch (fallbackError) {
                console.error(`💥 Error in AI panic mitigation for user ${userId}:`, fallbackError.message);
            }
        }
    }
}

module.exports = { runAIStrategy };