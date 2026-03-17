/**
 * BSB/server/src/au/engines/AIRiskManager.js
 * Risk and Capital Manager: Compound Interest Engine.
 * Armored Version: Floating point error prevention and normalization.
 */

class AIRiskManager {
    constructor() {
        // 🟢 AUDIT: Minimum limit to avoid dust operations.
        this.MIN_TRADE_AMOUNT = 5.0; 
        this.SAFETY_MARGIN = 0.02; // Increased slightly for safer JS rounding
    }

    /**
     * Determines if the bot has enough "fuel" (balance) to operate.
     */
    checkOperatingState(bot) {
        if (!bot) return { action: 'NONE' };

        const currentBalance = parseFloat(bot.aibalance || 0);
        
        // Auto-Resume: If it was paused but we now detect sufficient capital.
        // We use a small buffer (+0.5) to avoid rapid Pause/Resume flip-flopping.
        if (bot.aistate === 'PAUSED' && currentBalance >= (this.MIN_TRADE_AMOUNT + 0.5)) {
            return { action: 'RESUME' };
        }
        
        // Auto-Pause: If capital falls below the operational minimum.
        if (bot.aistate === 'RUNNING' && currentBalance < this.MIN_TRADE_AMOUNT) {
            return { action: 'PAUSE' };
        }
        
        return { action: 'CONTINUE' };
    }

    /**
     * Capital Management Strategy.
     * 🟢 AUDIT: Implements full compound interest.
     * Ensures a clean number is returned and restricts the amount to available balance.
     */
    calculateInvestment(bot) {
        const balance = parseFloat(bot.aibalance || 0);
        
        if (balance < this.MIN_TRADE_AMOUNT) return 0;

        // We return the balance minus a safety margin to prevent 
        // "Insufficient Balance" errors due to JS decimal precision.
        const safeInvestment = balance - this.SAFETY_MARGIN;
        
        // Return a clean 2-decimal number
        return parseFloat(Math.max(0, safeInvestment).toFixed(2));
    }
}

module.exports = new AIRiskManager();