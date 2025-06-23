// server/utils/BotManager.js

const Autobot = require('../classes/Autobot');
const AIBot = require('../classes/AIBot');
const BotStateModel = require('../models/BotState'); // To access the Mongoose model directly

class BotManager {
    constructor() {
        if (BotManager.instance) {
            return BotManager.instance;
        }
        this.activeBots = {}; // Stores active bot instances: { userId: { autobot: AutobotInstance, aibot: AIBotInstance } }
        this.io = null; // Socket.IO instance, set later in server.js
        BotManager.instance = this;
    }

    // This method will be called once from server.js to set the Socket.IO instance
    setIo(ioInstance) {
        this.io = ioInstance;
        console.log('[BotManager] Socket.IO instance set.');
    }

    /**
     * Handles the license extension for the AIBot, now with real verification.
     * @param {string} userId - The ID of the user.
     * @param {Object} apiCredentials - User's BitMart API credentials.
     * @param {number} amountUSDT - The amount of USDT transferred for license (or BTC equivalent).
     * @param {string} transactionId - The transaction ID of the deposit.
     * @param {string} sourceWalletAddress - The user's wallet address from which the payment was sent.
     * @param {string} currency - 'BTC' or 'USDT'.
     * @param {string} network - 'ERC20', 'TRC20', etc.
     * @returns {Promise<Object>} Result of the license extension.
     */
    async extendAIBotLicense(userId, apiCredentials, amountUSDT, transactionId, sourceWalletAddress, currency, network) {
        try {
            const aibotInstance = await this.getBotInstance(userId, 'aibot', apiCredentials);
            // Ahora pasamos todos los detalles necesarios para la verificación
            const result = await aibotInstance.extendLicense(amountUSDT, transactionId, sourceWalletAddress, currency, network);
            return result;
        } catch (error) {
            console.error(`[BotManager] Error extending AIBot license for user ${userId}:`, error.message);
            return { success: false, message: `Failed to extend AIBot license: ${error.message}` };
        }
    }

    // --- TEMPORAL: Método para activar la licencia de prueba (¡ELIMINAR EN PRODUCCIÓN!) ---
    async activateTestAIBotLicense(userId, apiCredentials) {
        try {
            const aibotInstance = await this.getBotInstance(userId, 'aibot', apiCredentials);
            await aibotInstance.setTestLicense();
            return { success: true, message: 'Licencia de prueba activada por 100 días.' };
        } catch (error) {
            console.error(`[BotManager] Error activating test AIBot license for user ${userId}:`, error.message);
            return { success: false, message: `Failed to activate test AIBot license: ${error.message}` };
        }
    }

    async getBotInstance(userId, botType, apiCredentials) {
        if (!this.activeBots[userId]) {
            this.activeBots[userId] = {};
        }

        if (!this.activeBots[userId][botType]) {
            console.log(`[BotManager] Creating new ${botType} instance for user ${userId}.`);
            let botInstance;
            if (botType === 'autobot') {
                botInstance = new Autobot(userId, apiCredentials, this.io);
            } else if (botType === 'aibot') {
                botInstance = new AIBot(userId, apiCredentials, this.io);
            } else {
                throw new Error(`Invalid bot type: ${botType}`);
            }
            // Load the state immediately upon instantiation
            await botInstance.loadBotState();
            this.activeBots[userId][botType] = botInstance;
        } else {
            console.log(`[BotManager] Reusing existing ${botType} instance for user ${userId}.`);
            // Ensure the IO instance is up-to-date if it was set after bot creation
            if (this.io && this.activeBots[userId][botType].io !== this.io) {
                this.activeBots[userId][botType].io = this.io;
            }
            // Ensure credentials are correct if they change or are re-provided
            this.activeBots[userId][botType].apiCredentials = apiCredentials;
        }

        return this.activeBots[userId][botType];
    }

    /**
     * Starts a specific bot for a user.
     * @param {string} userId - The ID of the user.
     * @param {string} botType - 'autobot' or 'aibot'.
     * @param {Object} apiCredentials - User's BitMart API credentials.
     * @param {Object} [params] - Optional parameters for the bot (e.g., purchaseAmount for Autobot, settings for AIBot).
     * @returns {Promise<Object>} Result of the start operation.
     */
    async startBot(userId, botType, apiCredentials, params = {}) {
        if (!this.io) {
            console.error('[BotManager] Socket.IO instance not set. Cannot start bot.');
            return { success: false, message: 'Server not fully initialized (Socket.IO missing).' };
        }
        try {
            const botInstance = await this.getBotInstance(userId, botType, apiCredentials);
            const result = await botInstance.startStrategy(params);
            console.log(`[BotManager] ${botType} started for user ${userId}: ${result.success}`);
            return result;
        } catch (error) {
            console.error(`[BotManager] Error starting ${botType} for user ${userId}:`, error.message);
            return { success: false, message: `Failed to start ${botType}: ${error.message}` };
        }
    }

    /**
     * Stops a specific bot for a user.
     * @param {string} userId - The ID of the user.
     * @param {string} botType - 'autobot' or 'aibot'.
     * @returns {Promise<Object>} Result of the stop operation.
     */
    async stopBot(userId, botType) {
        if (!this.activeBots[userId] || !this.activeBots[userId][botType]) {
            console.warn(`[BotManager] No active ${botType} instance found for user ${userId} to stop.`);
            return { success: false, message: `${botType} not running or instance not found.` };
        }
        try {
            const botInstance = this.activeBots[userId][botType];
            const result = await botInstance.stopStrategy();
            console.log(`[BotManager] ${botType} stopped for user ${userId}: ${result.success}`);
            return result;
        } catch (error) {
            console.error(`[BotManager] Error stopping ${botType} for user ${userId}:`, error.message);
            return { success: false, message: `Failed to stop ${botType}: ${error.message}` };
        }
    }

    /**
     * Gets the current state of a specific bot for a user.
     * Useful for initial UI load.
     * @param {string} userId - The ID of the user.
     * @param {string} botType - 'autobot' or 'aibot'.
     * @param {Object} apiCredentials - User's BitMart API credentials (needed if instance isn't loaded yet)
     * @returns {Promise<Object|null>} The bot's state or null if not found.
     */
    async getBotState(userId, botType, apiCredentials) {
        try {
            const botInstance = await this.getBotInstance(userId, botType, apiCredentials);
            // Return a copy to prevent direct modification of internal state
            // and include daysRemaining for AIBot if applicable
            if (botType === 'aibot' && botInstance.botState) {
                const daysRemaining = Math.ceil((new Date(botInstance.botState.licenseEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                return { ...botInstance.botState._doc, daysRemaining };
            }
            return botInstance.botState ? { ...botInstance.botState._doc } : null;
        } catch (error) {
            console.error(`[BotManager] Error getting ${botType} state for user ${userId}:`, error.message);
            return null;
        }
    }

    /**
     * Handles the license extension for the AIBot.
     * @param {string} userId - The ID of the user.
     * @param {Object} apiCredentials - User's BitMart API credentials.
     * @param {number} amountUSDT - The amount of USDT transferred for license.
     * @returns {Promise<Object>} Result of the license extension.
     */
    async extendAIBotLicense(userId, apiCredentials, amountUSDT) {
        try {
            const aibotInstance = await this.getBotInstance(userId, 'aibot', apiCredentials);
            const result = await aibotInstance.extendLicense(amountUSDT);
            return result;
        } catch (error) {
            console.error(`[BotManager] Error extending AIBot license for user ${userId}:`, error.message);
            return { success: false, message: `Failed to extend AIBot license: ${error.message}` };
        }
    }

    /**
     * Cleans up inactive bot instances (optional, for long-running servers).
     * You might want to implement a more sophisticated cleanup based on user activity.
     */
    cleanupInactiveBots() {
        // Implement logic to clear instances if users are offline for a long time
        // or if server memory becomes an issue. For now, we keep them in memory.
        console.log('[BotManager] Performing cleanup (placeholder).');
    }
}

// Export a singleton instance
module.exports = new BotManager();