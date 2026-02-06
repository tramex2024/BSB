/**
 * Archivo: server/src/aiStrategy.js
 * Wrapper para integrar el AIEngine en el ciclo secuencial del Autobot.
 */

const aiEngine = require('./ai/AIEngine');

let deps = {};

/**
 * Inyecta las dependencias globales del bot
 */
function setDependencies(dependencies) {
    deps = dependencies;
}

/**
 * Ejecuta un ciclo de análisis de la IA
 */
async function runAIStrategy() {
    try {
        const { currentPrice, botState } = deps;

        // Si el motor de IA está apagado en su propio estado, no hacemos nada
        if (!aiEngine.isRunning) return;

        // Sincronizamos el IO si no estaba seteado
        if (!aiEngine.io && deps.io) {
            aiEngine.setIo(deps.io);
        }

        // Ejecutamos el análisis con el precio actual del ciclo
        // Esto garantiza que la IA vea el mismo precio que el Long y el Short
        await aiEngine.analyze(currentPrice);

    } catch (error) {
        if (deps.log) {
            deps.log(`❌ [AI-STRATEGY-ERROR]: ${error.message}`, 'error');
        } else {
            console.error("Error en AI Strategy:", error);
        }
    }
}

module.exports = {
    runAIStrategy,
    setDependencies
};