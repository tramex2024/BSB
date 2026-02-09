/**
 * BSB/server/services/cycleLogService.js
 * SERVICIO DE REGISTRO DE CICLOS (Analytics Multi-usuario)
 * Optimizado con cálculo de ROI y validación de integridad.
 */

const TradeCycle = require('../models/TradeCycle');

/**
 * Registra un resumen de un ciclo de trading completado (Take Profit / Stop Loss).
 * @param {object} data - Datos del ciclo
 * @param {string} data.userId - ID limpio del usuario (MongoDB ObjectId)
 * @param {number} data.totalInvestment - Capital total usado en el ciclo
 * @param {number} data.netProfit - Ganancia neta en USDT (puede ser negativa)
 * @param {string} data.side - 'long' o 'short'
 * @param {string} data.strategy - 'autobot' o 'neural_ai'
 */
async function logSuccessfulCycle(data) {
    try {
        // 1. VALIDACIÓN CRÍTICA DE IDENTIDAD
        if (!data.userId) {
            console.error('[CYCLE_LOG] ❌ Error: Se intentó registrar un ciclo sin userId.');
            return null;
        }

        // 2. CÁLCULO DE ROI (Retorno sobre la Inversión)
        // Evitamos división por cero y calculamos el porcentaje
        let roiCalculated = 0;
        if (data.totalInvestment && data.totalInvestment > 0) {
            roiCalculated = (data.netProfit / data.totalInvestment) * 100;
        }

        // 3. PERSISTENCIA EN MONGODB
        // Usamos el ID limpio directamente como lo configuramos en los controladores
        const newCycle = new TradeCycle({
            userId: data.userId,
            side: data.side || 'long',
            strategy: data.strategy || 'autobot',
            totalInvestment: parseFloat(data.totalInvestment || 0),
            netProfit: parseFloat(data.netProfit || 0),
            roi: parseFloat(roiCalculated.toFixed(2)), // Guardamos con 2 decimales para la gráfica
            duration: data.duration || 0, // En segundos o minutos según tu lógica
            timestamp: new Date()
        });

        await newCycle.save();
        
        console.log(`[CYCLE_LOG] ✅ Ciclo guardado [User: ${data.userId}] [ROI: ${roiCalculated.toFixed(2)}%]`);
        
        return newCycle;
    } catch (error) {
        console.error('[CYCLE_LOG] ❌ Error al registrar ciclo en DB:', error.message);
        return null; 
    }
}

module.exports = {
    logSuccessfulCycle
};