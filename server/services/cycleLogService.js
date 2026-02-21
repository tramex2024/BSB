/**
 * BSB/server/services/cycleLogService.js
 * SERVICIO DE REGISTRO DE CICLOS - Auditado y Alineado con Schema 2026
 */
const TradeCycle = require('../models/TradeCycle');

/**
 * Registra un ciclo completo alineado con TradeCycleSchema
 * @param {object} data - Datos provenientes de los DataManagers (Long/Short/AI)
 */
async function logSuccessfulCycle(data) {
    try {
        // 1. VALIDACIÓN DE IDENTIDAD
        if (!data.userId) {
            console.error('[CYCLE_LOG] ❌ Error: userId ausente en los datos del ciclo.');
            return null;
        }

        // 2. CONSTRUCCIÓN ALINEADA AL MODELO (TradeCycle.js)
        // Mapeamos exactamente lo que el Manager envía y lo que el Schema requiere
        const cycleData = {
            userId: data.userId,
            autobotId: data.autobotId,
            strategy: data.strategy, // 'Long', 'Short' o 'AI'
            cycleIndex: data.cycleIndex || 0,
            symbol: data.symbol || 'BTC_USDT',
            
            startTime: data.startTime || new Date(),
            endTime: data.endTime || new Date(),
            
            initialInvestment: parseFloat(data.initialInvestment || 0),
            finalRecovery: parseFloat(data.finalRecovery || 0),
            netProfit: parseFloat(data.netProfit || 0),
            profitPercentage: parseFloat(data.profitPercentage || 0),
            
            averagePPC: parseFloat(data.averagePPC || 0),
            finalSellPrice: parseFloat(data.finalSellPrice || 0),
            orderCount: parseInt(data.orderCount || 0),
            
            status: 'COMPLETED'
        };

        // 3. PERSISTENCIA
        const newCycle = new TradeCycle(cycleData);
        await newCycle.save();
        
        console.log(`[CYCLE_LOG] ✅ Ciclo #${cycleData.cycleIndex} guardado para User: ${data.userId} [Profit: ${cycleData.netProfit.toFixed(2)} USDT]`);
        
        return newCycle;
    } catch (error) {
        console.error('[CYCLE_LOG] ❌ Error de validación contra el Schema:', error.message);
        return null; 
    }
}

module.exports = { logSuccessfulCycle };