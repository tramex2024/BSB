// BSB/server/src/aiStrategy.js

/**
 * BSB/server/src/aiStrategy.js
 * Wrapper to integrate AIEngine into the sequential Autobot cycle.
 */

const aiEngine = require('./ai/AIEngine');

/**
 * Executes an AI analysis cycle.
 * @param {Object} dependencies - Data injected from the central engine (botCycle).
 */
async function runAIStrategy(dependencies) {
    // 1. Integrity Verification (Fail-fast)
    if (!dependencies || !dependencies.botState || !dependencies.currentPrice) {
        return;
    }

    const { currentPrice, botState, userId, io, log } = dependencies;

    try {
        // 2. State Control: Check if AI is enabled for THIS specific user
        if (!botState.config?.ai?.enabled) {
            return;
        }

        // 3. Dynamic Socket Synchronization
        // Ensures the AI engine can broadcast updates to the specific user's dashboard room
        if (!aiEngine.io && io) {
            aiEngine.setIo(io);
        }

        /**
         * 4. Predictive Analysis Execution
         * Note: Ensure aiEngine internal broadcasts use the 'user_${userId}' room convention.
         */
        
        // AI engine processes data in isolation for this specific userId
        await aiEngine.analyze(currentPrice, userId);

    } catch (error) {
        // Isolated Error: A failure in one user's AI logic won't stop the bot for others
        if (log) {
            log(`❌ [AI-STRATEGY-ERROR]: ${error.message}`, 'error');
        }
        console.error(`[CRITICAL-AI][User: ${userId}]:`, error);
    }
}

// Clean export without global state variables
module.exports = {
    runAIStrategy
};