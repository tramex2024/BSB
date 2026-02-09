// BSB/server/src/utils/botUtilities.js

/**
 * 2026 SYSTEM UTILITIES
 * This file handles maintenance and Hard Reset logic for bots.
 * Unlike DataManagers, this reset is used for emergencies or manual user-requested cleanups.
 */

const Autobot = require('../../../models/Autobot'); 
const { CLEAN_LONG_ROOT, CLEAN_SHORT_ROOT } = require('../au/utils/cleanState');

/**
 * Performs a total reset of the bot state for a specific user.
 * Preserves configuration, total accumulated profit, and cycle history.
 * @param {string} userId - Unique ID of the user who owns the bot.
 */
async function resetAndInitializeBot(userId) {
    if (!userId) {
        console.error("❌ [SYSTEM] Error: userId is required to execute a reset.");
        return;
    }

    try {
        // 1. Fetch current bot for the specific user
        const currentBot = await Autobot.findOne({ userId });
        
        if (!currentBot) {
            console.log(`⚠️ [SYSTEM] No bot found for user: ${userId}.`);
            return;
        }

        // 2. Extract data that MUST be preserved (Config and Lifetime Stats)
        const config = currentBot.config || {}; 
        const totalProfit = parseFloat(currentBot.total_profit) || 0; 
        const lcycle = parseInt(currentBot.lcycle) || 0;
        const scycle = parseInt(currentBot.scycle) || 0;

        // 3. Restore initial balances from user configuration
        // If the user updated their capital in settings, the reset applies the new amount.
        const initialLBalance = config.long?.amountUsdt || 0; 
        const initialSBalance = config.short?.amountUsdt || 0; 

        // 4. Construct the reset object (2026 Root Acronyms)
        const resetData = {
            // Operational state
            "lstate": "STOPPED",
            "sstate": "STOPPED",
            "total_profit": totalProfit,
            "lcycle": lcycle,
            "scycle": scycle,
            "lbalance": initialLBalance, 
            "sbalance": initialSBalance, 

            // Deep clean of averages, pending orders, and trailings
            ...CLEAN_LONG_ROOT,
            ...CLEAN_SHORT_ROOT,

            "updatedAt": new Date()
        };

        // 5. Atomic update in Database
        // We use updateOne with userId to guarantee we DO NOT touch other users' data.
        const updateResult = await Autobot.updateOne(
            { userId: userId }, 
            { $set: resetData }
        );
        
        if (updateResult.modifiedCount > 0) {
            console.log(`✅ [SYSTEM] Hard Reset successful for user: ${userId}`);
            console.log(`📊 Preserved Data -> Profit: $${totalProfit} | Cycles: L(${lcycle}) S(${scycle})`);
        } else {
            console.log(`⚠️ [SYSTEM] Reset executed but no changes were applied for user: ${userId}`);
        }
        
    } catch (error) {
        console.error(`❌ [SYSTEM] Critical error in resetAndInitializeBot: ${error.message}`);
    }
}

module.exports = {
    resetAndInitializeBot
};