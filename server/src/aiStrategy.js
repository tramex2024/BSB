/**
 * BSB/server/src/aiStrategy.js
 * Wrapper para integrar el AIEngine en el ciclo secuencial del Autobot.
 */

const aiEngine = require('./ai/AIEngine'); // Asegúrate que la ruta sea correcta

async function runAIStrategy(dependencies) {
    if (!dependencies || !dependencies.botState || !dependencies.currentPrice) {
        return;
    }

    const { currentPrice, botState, userId, io, log } = dependencies;

    try {
        // CORRECCIÓN: Si el estado es RUNNING, permitimos el análisis 
        // aunque el flag anidado 'enabled' tenga lag de sincronización.
        if (botState.aistate !== 'RUNNING') {
            return;
        }

        if (io && typeof aiEngine.setIo === 'function') {
            aiEngine.setIo(io);
        }

        // Ejecución del Análisis
        await aiEngine.analyze(currentPrice, userId);

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