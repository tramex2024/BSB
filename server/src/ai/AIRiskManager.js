/**
 * BSB/server/src/au/engines/AIRiskManager.js
 * Gestor de Riesgo y Capital: Motor de Interés Compuesto.
 */
class AIRiskManager {
    constructor() {
        // 🟢 AUDITORÍA: Límite mínimo para evitar operaciones con montos despreciables.
        this.MIN_TRADE_AMOUNT = 5; 
    }

    /**
     * Determina si el bot tiene el combustible (balance) necesario para operar.
     */
    checkOperatingState(bot) {
        const currentBalance = parseFloat(bot.aibalance || 0);
        
        // Auto-Reactivación si el usuario añadió fondos
        if (bot.aistate === 'PAUSED' && currentBalance >= this.MIN_TRADE_AMOUNT) {
            return { action: 'RESUME' };
        }
        
        // Auto-Pausa si el balance es insuficiente para un trade digno
        if (bot.aistate === 'RUNNING' && currentBalance < this.MIN_TRADE_AMOUNT) {
            return { action: 'PAUSE' };
        }
        
        return { action: 'CONTINUE' };
    }

    /**
     * Estrategia de Gestión de Capital.
     * 🟢 AUDITORÍA: Implementa interés compuesto total (All-in del balance de IA).
     */
    calculateInvestment(bot) {
        // Retorna el balance completo para maximizar el crecimiento exponencial
        return parseFloat(bot.aibalance || 0);
    }
}

module.exports = new AIRiskManager();