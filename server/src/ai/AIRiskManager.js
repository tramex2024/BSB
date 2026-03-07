/**
 * BSB/server/src/au/engines/AIRiskManager.js
 * Gestor de Riesgo y Capital: Motor de Interés Compuesto.
 * Versión Blindada: Prevención de errores de punto flotante y normalización.
 */

class AIRiskManager {
    constructor() {
        // 🟢 AUDITORÍA: Límite mínimo para evitar operaciones con montos despreciables (Polvo/Dust).
        this.MIN_TRADE_AMOUNT = 5; 
        this.SAFETY_MARGIN = 0.01; // Margen para asegurar que el balance nunca sea negativo por redondeo.
    }

    /**
     * Determina si el bot tiene el combustible (balance) necesario para operar.
     */
    checkOperatingState(bot) {
        if (!bot) return { action: 'NONE' };

        const currentBalance = parseFloat(bot.aibalance || 0);
        
        // Auto-Reactivación: Si estaba pausado y detectamos capital suficiente.
        if (bot.aistate === 'PAUSED' && currentBalance >= this.MIN_TRADE_AMOUNT) {
            return { action: 'RESUME' };
        }
        
        // Auto-Pausa: Si el capital cae por debajo del mínimo operativo.
        if (bot.aistate === 'RUNNING' && currentBalance < this.MIN_TRADE_AMOUNT) {
            return { action: 'PAUSE' };
        }
        
        return { action: 'CONTINUE' };
    }

    /**
     * Estrategia de Gestión de Capital.
     * 🟢 AUDITORÍA: Implementa interés compuesto total.
     * Se asegura de retornar un número limpio y restringe el monto al balance disponible.
     */
    calculateInvestment(bot) {
        const balance = parseFloat(bot.aibalance || 0);
        
        if (balance < this.MIN_TRADE_AMOUNT) return 0;

        // Retornamos el balance con un pequeño margen de seguridad para evitar
        // errores de "Insufficient Balance" debido al redondeo de decimales en JS.
        const safeInvestment = balance - this.SAFETY_MARGIN;
        
        return parseFloat(safeInvestment.toFixed(2));
    }
}

module.exports = new AIRiskManager();