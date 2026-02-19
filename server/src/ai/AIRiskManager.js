/**
 * BSB/server/src/au/engines/AIRiskManager.js
 */
class AIRiskManager {
    constructor() {
        this.MIN_TRADE_AMOUNT = 5; 
    }

    checkOperatingState(bot) {
        const currentBalance = parseFloat(bot.aibalance || 0);
        if (bot.aistate === 'PAUSED' && currentBalance >= this.MIN_TRADE_AMOUNT) {
            return { action: 'RESUME' };
        }
        if (bot.aistate === 'RUNNING' && currentBalance < this.MIN_TRADE_AMOUNT) {
            return { action: 'PAUSE' };
        }
        return { action: 'CONTINUE' };
    }

    calculateInvestment(bot) {
        // Interés Compuesto: Usa todo el balance acumulado
        return parseFloat(bot.aibalance || 0);
    }
}

module.exports = new AIRiskManager();