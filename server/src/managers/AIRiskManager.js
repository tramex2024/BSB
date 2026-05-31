/**
 * BSB/server/src/managers/AIRiskManager.js
 * Versión Híbrida: Validación de Saldo + Validación de Tendencia
 */

class AIRiskManager {
    constructor() {
        this.MIN_TRADE_AMOUNT = 5.0; 
        this.SAFETY_MARGIN = 0.02; 
    }

    /**
     * Valida si la operación es segura basándose en balance y contexto de mercado
     */
    checkOperatingState(bot, marketContext = null) {
        if (!bot) return { action: 'NONE', canOperate: false };

        const currentBalance = parseFloat(bot.aibalance || 0);
        
        // 1. Validación de Saldo
        const hasBalance = currentBalance >= this.MIN_TRADE_AMOUNT;
        
        // 2. Validación de Mercado (Nuevo: Si la señal es 'STRONG_SELL', bloqueamos nuevas compras)
        const marketSafe = marketContext ? (marketContext.signal !== 'STRONG_SELL') : true;

        if (bot.aistate === 'PAUSED' && hasBalance) {
            return { action: 'RESUME', canOperate: true };
        }
        
        if (bot.aistate === 'RUNNING' && (!hasBalance || !marketSafe)) {
            return { action: 'PAUSE', canOperate: false };
        }
        
        return { 
            action: 'CONTINUE', 
            canOperate: bot.aistate === 'RUNNING' && hasBalance && marketSafe
        };
    }

    calculateInvestment(bot) {
        const balance = parseFloat(bot.aibalance || 0);
        if (balance < this.MIN_TRADE_AMOUNT) return 0;
        const safeInvestment = balance - this.SAFETY_MARGIN;
        return parseFloat(Math.max(0, safeInvestment).toFixed(2));
    }
}

module.exports = new AIRiskManager();