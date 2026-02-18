/**
 * BSB/server/src/aiStrategy.js
 * Versión Blindada: Adaptador de ejecución para el Motor de IA.
 */

const aiEngine = require('./ai/AIEngine');

async function runAIStrategy(dependencies) {
    // 1. Validación de integridad de datos
    if (!dependencies || !dependencies.botState || !dependencies.currentPrice) {
        return;
    }

    const { 
        currentPrice, 
        botState, 
        userId, 
        io, 
        log, 
        placeAIOrder,           // Inyectado desde autobotLogic
        updateAIStateData,      // Inyectado desde autobotLogic
        updateBotState          // Inyectado desde autobotLogic
    } = dependencies;

    try {
        // 2. FILTRO DE ESTADO OPERATIVO
        if (!botState.aistate || botState.aistate === 'STOPPED') {
            return;
        }

        // 3. OPTIMIZACIÓN DE SOCKET (Solo si el Engine tiene el método)
        if (io && aiEngine.io !== io && typeof aiEngine.setIo === 'function') {
            aiEngine.setIo(io);
        }

        /**
         * 4. EJECUCIÓN DE ANÁLISIS Y ACCIÓN
         * Pasamos las funciones de ejecución (placeAIOrder, etc.) al Engine.
         * Esto permite que el Engine decida QUÉ hacer, pero que use el 
         * canal oficial de la IA para ejecutar las órdenes.
         */
        await aiEngine.analyze(currentPrice, userId, {
            ...botState,
            // Sobreescribimos con las funciones oficiales del orquestador
            placeAIOrder,
            updateAIStateData,
            updateBotState,
            log
        });

    } catch (error) {
        if (log) {
            log(`❌ [AI-STRATEGY-ERROR]: ${error.message}`, 'error');
        }
        console.error(`[AI-STRATEGY][User: ${userId}]:`, error);
    }
}

module.exports = {
    runAIStrategy
};