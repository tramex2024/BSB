/**
 * BSB/server/src/aiStrategy.js
 * Versión Optimizada: Adaptador que inyecta MarketContext al Motor de IA
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
        marketContext, // <--- NUEVO: Acceso a la fuente única de verdad
        placeAIOrder,           
        updateAIStateData,      
        updateBotState          
    } = dependencies;

    const currentState = botState.aistate || 'STOPPED';

    try {
        // 2. FILTRO DE ESTADO OPERATIVO
        if (currentState === 'STOPPED') return;

        /**
         * 3. EJECUCIÓN BASADA EN CONTEXTO CENTRALIZADO
         * Pasamos el marketContext para que el AIEngine no pierda tiempo calculando,
         * solo evalúe la estrategia de decisión.
         */
        await aiEngine.analyze(currentPrice, userId, {
            botState,
            marketContext, // <--- INYECCIÓN DEL ESTADO GLOBAL DEL MERCADO
            placeAIOrder,
            updateAIStateData,
            updateBotState,
            log,
            syncFrontendState: dependencies.syncFrontendState 
        });

    } catch (error) {
        if (log) log(`❌ [AI-STRATEGY-ERROR]: ${error.message}`, 'error');
        console.error(`[AI-STRATEGY][User: ${userId}]:`, error);

        // [FALLBACK DE SEGURIDAD]
        if (currentState === 'RUNNING') {
            try {
                log(`🚨 [FALLBACK AI] Pausa de emergencia por error en Engine.`, 'warning');
                await updateBotState('PAUSED', 'ai');
            } catch (fallbackError) {
                console.error(`💥 Error en mitigación de pánico AI ${userId}:`, fallbackError.message);
            }
        }
    }
}

module.exports = { runAIStrategy };