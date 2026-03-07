/**
 * BSB/server/src/aiStrategy.js
 * Versión Blindada: Adaptador de ejecución para el Motor de IA.
 * FIX: Inyección de funciones persistentes y manejo de socket.
 */

const aiEngine = require('./ai/AIEngine');

async function runAIStrategy(dependencies) {
    // 1. VALIDACIÓN DE INTEGRIDAD DE DATOS
    // 🟢 AUDITORÍA: Previene fallos en cascada si el orquestador no provee el estado o el precio.
    if (!dependencies || !dependencies.botState || !dependencies.currentPrice) {
        return;
    }

    const { 
        currentPrice, 
        botState, 
        userId, 
        io, 
        log, 
        placeAIOrder,           // Canal oficial inyectado desde autobotLogic
        updateAIStateData,      // Escribe directamente en el changeSet del ciclo actual
        updateBotState          // Maneja estados globales (RUNNING/STOPPED/PAUSED)
    } = dependencies;

    try {
        // 2. FILTRO DE ESTADO OPERATIVO
        // 🟢 AUDITORÍA: Si la IA está apagada (STOPPED), el motor no consume recursos ni realiza análisis.
        if (!botState.aistate || botState.aistate === 'STOPPED') {
            return;
        }

        // 3. OPTIMIZACIÓN DE SOCKET
        // 🟢 AUDITORÍA: Vincula el canal de comunicación en tiempo real solo si es necesario.
        if (io && typeof aiEngine.setIo === 'function' && aiEngine.io !== io) {
            aiEngine.setIo(io);
        }

        /**
         * 4. EJECUCIÓN DE ANÁLISIS Y ACCIÓN
         * 🟢 AUDITORÍA: El Engine recibe el contexto completo. 
         * Importante: Usamos 'updateAIStateData' para que cualquier cambio en el balance
         * o precios de entrada de la IA se capture en el 'changeSet' de este ciclo.
         */
        await aiEngine.analyze(currentPrice, userId, {
            ...botState,
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