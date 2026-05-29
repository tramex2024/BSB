/**
 * BSB/server/src/aiStrategy.js
 * Versión Blindada: Adaptador de ejecución para el Motor de IA (Anti-Fugas y Multi-User)
 */

const aiEngine = require('./states/ai/AIEngine');

async function runAIStrategy(dependencies) {
    // 1. Validación de integridad de datos (Fail-fast)
    if (!dependencies || !dependencies.botState || !dependencies.currentPrice || !dependencies.userId) {
        return;
    }

    const { 
        currentPrice, 
        botState, 
        userId, 
        log, 
        placeAIOrder,           
        updateAIStateData,      
        updateBotState          
    } = dependencies;

    const currentState = botState.aistate || 'STOPPED';

    try {
        // 2. FILTRO DE ESTADO OPERATIVO
        if (currentState === 'STOPPED') {
            return;
        }

        /**
         * 3. EJECUCIÓN DE ANÁLISIS Y ACCIÓN
         * [BLINDAJE]: Pasamos la referencia directa de las funciones operativas y evitamos
         * el anti-patrón de clonación superficial que rompía la persistencia en memoria.
         * Eliminamos la mutación global de setIo para prevenir fugas de información entre usuarios.
         */
        await aiEngine.analyze(currentPrice, userId, {
            botState, // Pasamos el estado real para permitir mutaciones e inspección directa
            placeAIOrder,
            updateAIStateData,
            updateBotState,
            log,
            // Si el motor de IA requiere emitir al cliente, usará el wrapper seguro provisto por el orquestador
            syncFrontendState: dependencies.syncFrontendState 
        });

    } catch (error) {
        if (log) {
            log(`❌ [AI-STRATEGY-ERROR]: ${error.message}`, 'error');
        }
        console.error(`[AI-STRATEGY][User: ${userId}]:`, error);

        // [FALLBACK DE SEGURIDAD]: Mantenemos la simetría con Long y Short. 
        // Si el motor de IA colapsa, pausamos la estrategia para proteger la cuenta.
        if (currentState === 'RUNNING') {
            try {
                log(`🚨 [FALLBACK AI ACTIVADO] Forzando pausa de emergencia [RUNNING ➡️ PAUSED] por error en Engine.`, 'warning');
                if (typeof updateBotState === 'function') {
                    await updateBotState('PAUSED', 'ai');
                } else {
                    botState.aistate = 'PAUSED';
                }
            } catch (fallbackError) {
                console.error(`💥 [SUPER-CRITICAL-AI] Falló la mitigación de pánico de IA para el usuario ${userId}:`, fallbackError.message);
            }
        }
    }
}

module.exports = {
    runAIStrategy
};