/**
 * BSB/server/src/aiStrategy.js
 * Wrapper para integrar el AIEngine en el ciclo secuencial del Autobot.
 */

const aiEngine = require('./ai/AIEngine');

/**
 * Ejecuta un ciclo de análisis de la IA.
 * @param {Object} dependencies - Datos inyectados desde el motor central (botCycle).
 */
async function runAIStrategy(dependencies) {
    // 1. Verificación de integridad (Fail-fast)
    if (!dependencies || !dependencies.botState || !dependencies.currentPrice) {
        return;
    }

    const { currentPrice, botState, userId, io, log } = dependencies;

    try {
        // 2. Control de Estado: Verificamos si la IA está habilitada para ESTE usuario
        // Usamos la ruta de config que definimos en el modelo Autobot.js
        if (!botState.config?.ai?.enabled) {
            return;
        }

        // 3. Sincronización dinámica de Sockets
        // Aseguramos que el motor de IA pueda hablar con el canal privado del usuario
        if (!aiEngine.io && io) {
            aiEngine.setIo(io);
        }

        /**
         * 4. Ejecución del Análisis Predictivo
         * El motor de IA recibe el contexto y decide si hay una oportunidad.
         * Internamente, AIEngine consultará MarketSignal y el historial.
         */
        
        // Opcional: Log de debug para saber que la IA está escaneando
        // log(`🧠 AI Engine scanning market for ${botState.config.symbol}...`, 'info');

        await aiEngine.analyze(currentPrice, userId);

    } catch (error) {
        // Error aislado: El fallo de la IA de un usuario no detiene el bot de los demás
        if (log) {
            log(`❌ [AI-STRATEGY-ERROR] (User: ${userId}): ${error.message}`, 'error');
        }
        console.error(`[CRITICAL-AI][User: ${userId}]:`, error);
    }
}

// Exportación limpia sin variables globales de estado
module.exports = {
    runAIStrategy
};