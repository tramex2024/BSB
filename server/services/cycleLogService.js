/**
 * BSB/server/services/cycleLogService.js
 * SERVICIO DE REGISTRO DE CICLOS (Analytics Multi-usuario)
 */

const TradeCycle = require('../models/TradeCycle');

/**
 * Registra un resumen de un ciclo de trading completado (Take Profit).
 * @param {object} data - Datos del ciclo (userId, totalInvestment, netProfit, duration, etc.)
 */
async function logSuccessfulCycle(data) {
    try {
        // VALIDACIÓN CRÍTICA: Aseguramos que el ciclo pertenezca a alguien
        if (!data.userId) {
            console.error('[CYCLE_LOG] ❌ Error: Se intentó registrar un ciclo sin userId.');
            return null;
        }

        // Creamos el registro en la base de datos
        // El modelo TradeCycle debe tener definido el campo userId: { type: Schema.Types.ObjectId, ref: 'User' }
        const newCycle = new TradeCycle({
            ...data,
            timestamp: new Date() // Aseguramos fecha de registro
        });

        await newCycle.save();
        
        console.log(`[CYCLE_LOG] ✅ Ciclo guardado para usuario ${data.userId}. Profit: +${data.netProfit || 0} USDT`);
        
        return newCycle;
    } catch (error) {
        console.error('[CYCLE_LOG] ❌ Error al guardar el ciclo de trading:', error.message);
        return null; 
    }
}

module.exports = {
    logSuccessfulCycle
};