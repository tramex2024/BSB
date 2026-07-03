/**
 * BSB/server/src/aiStrategy.js
 * Versión Final: Adaptador optimizado sin redundancia de telemetría.
 */

const aiEngine = require('./states/ai/AIEngine');

async function runAIStrategy(dependencies) {
    // 1. Validación de integridad (Fail-fast)
    if (!dependencies || !dependencies.botState || !dependencies.currentPrice || !dependencies.userId) {
        return;
    }

    const { 
        currentPrice, 
        botState, 
        userId, 
        log, 
        marketContext, // Datos limpios provenientes de MarketSignal
        placeAIOrder,           
        updateBotState          
    } = dependencies;

    const currentState = botState.aistate || 'STOPPED';

    try {
        // 2. Filtro de estado operativo
        if (currentState === 'STOPPED') return;

        /**
         * 3. Ejecución estratégica centralizada
         * Pasamos el marketContext directo de MarketSignal para que el AIEngine 
         * tome decisiones analíticas inmediatas sin recalcular nada.
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

        // [Mitigación de Pánico]
        if (currentState === 'RUNNING') {
            try {
                log(`🚨 [FALLBACK AI] Pausa de emergencia activada por excepción en el motor.`, 'warning');
                await updateBotState('PAUSED', 'ai');
            } catch (fallbackError) {
                console.error(`💥 Falla crítica en mitigación de pánico IA para usuario ${userId}:`, fallbackError.message);
            }
        }
    }
}

module.exports = { runAIStrategy };