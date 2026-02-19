/**
 * BSB/server/src/au/engines/AIRiskManager.js
 * Gestión de Capital Operativo e Interés Compuesto
 */
class AIRiskManager {
    constructor() {
        this.MIN_TRADE_AMOUNT = 5; // Mínimo para pagar comisiones y operar
    }

    /**
     * Valida si el bot tiene fondos para despertar o debe entrar en pausa.
     */
    checkOperatingState(bot) {
        const currentBalance = parseFloat(bot.aibalance || 0);
        
        // Auto-Resume: Si estaba pausado pero el balance creció (manual o profit)
        if (bot.aistate === 'PAUSED' && currentBalance >= this.MIN_TRADE_AMOUNT) {
            return { action: 'RESUME', state: 'RUNNING' };
        }

        // Auto-Pause: Si el balance cayó por debajo del mínimo operativo
        if (bot.aistate === 'RUNNING' && currentBalance < this.MIN_TRADE_AMOUNT) {
            return { action: 'PAUSE', state: 'PAUSED' };
        }

        return { action: 'CONTINUE', state: bot.aistate };
    }

    /**
     * Lógica de Inversión Total: El bot opera con el aibalance íntegro.
     * El config.amountUsdt se ignora en favor del capital acumulado.
     */
    calculateInvestment(bot) {
        return parseFloat(bot.aibalance || 0);
    }
}

module.exports = new AIRiskManager();