/**
 * BSB/server/src/aiStrategy.js
 * Wrapper para integrar el AIEngine en el ciclo secuencial del Autobot.
 */

const aiEngine = require('./ai/AIEngine');

/**
 * Ejecuta un ciclo de análisis de IA.
 * @param {Object} dependencies - Datos inyectados desde el motor central.
 */
async function runAIStrategy(dependencies) {
    // 1. Verificación de Integridad (Fail-fast)
    if (!dependencies || !dependencies.botState || !dependencies.currentPrice) {
        return;
    }

    const { currentPrice, botState, userId, io, log } = dependencies;

    try {
        // 2. Control de Estado: ¿La IA está activada para ESTE usuario?
        // Verificamos en la config específica del bot del usuario
        if (!botState.config?.ai?.enabled) {
            return;
        }

        // 3. Sincronización Dinámica del Socket
        // Inyectamos el servidor IO al motor de IA si aún no lo tiene
        if (io && typeof aiEngine.setIo === 'function') {
            aiEngine.setIo(io);
        }

        /**
         * 4. Ejecución del Análisis Predictivo
         * El aiEngine debe estar preparado para manejar peticiones por userId
         * para que los resultados lleguen al room: `user_${userId}`.
         */
        
        // El motor de IA analiza el precio actual bajo el contexto del usuario
        // Esto permite que el AI Engine guarde su propio historial por usuario si fuera necesario
        await aiEngine.analyze(currentPrice, userId);

    } catch (error) {
        // Error Aislado: Un fallo en la IA de un usuario no detiene el ciclo de otros
        if (log) {
            log(`❌ [AI-STRATEGY-ERROR]: ${error.message}`, 'error');
        }
        console.error(`[AI-STRATEGY][User: ${userId}]:`, error);
    }
}

module.exports = {
    runAIStrategy
};