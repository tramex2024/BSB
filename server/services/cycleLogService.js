/**
 * BSB/server/services/cycleLogService.js
 * SERVICIO DE REGISTRO DE CICLOS - CORREGIDO (Cálculo de duración incluido)
 */
const TradeCycle = require('../models/TradeCycle');

/**
 * Registra un ciclo completo calculando automáticamente la duración en horas.
 * @param {object} data - Datos provenientes de los DataManagers (Long/Short/AI)
 */
async function logSuccessfulCycle(data) {
    try {
        // 1. VALIDACIÓN DE IDENTIDAD
        if (!data.userId) {
            console.error('[CYCLE_LOG] ❌ Error: userId ausente en los datos del ciclo.');
            return null;
        }

        // 2. PREPARACIÓN DE FECHAS PARA CÁLCULO
        const start = data.startTime ? new Date(data.startTime) : new Date();
        const end = data.endTime ? new Date(data.endTime) : new Date();
        
        // Cálculo de duración: (ms finales - ms iniciales) / (1000ms * 60s * 60m)
        const durationHours = (end - start) / (1000 * 60 * 60);

        // 3. CONSTRUCCIÓN ALINEADA AL MODELO (TradeCycle.js)
        const cycleData = {
            userId: data.userId,
            autobotId: data.autobotId,
            strategy: data.strategy,
            cycleIndex: data.cycleIndex || 0,
            symbol: data.symbol || 'BTC_USDT',
            
            startTime: start,
            endTime: end,
            durationHours: !isNaN(durationHours) ? durationHours : 0, // 👈 CORRECCIÓN: Se añade el cálculo
            
            initialInvestment: parseFloat(data.initialInvestment || 0),
            finalRecovery: parseFloat(data.finalRecovery || 0),
            netProfit: parseFloat(data.netProfit || 0),
            profitPercentage: parseFloat(data.profitPercentage || 0),
            
            averagePPC: parseFloat(data.averagePPC || 0),
            finalSellPrice: parseFloat(data.finalSellPrice || 0),
            orderCount: parseInt(data.orderCount || 0),
            
            status: 'COMPLETED'
        };

        // 4. PERSISTENCIA
        const newCycle = new TradeCycle(cycleData);
        await newCycle.save();
        
        console.log(`[CYCLE_LOG] ✅ Ciclo #${cycleData.cycleIndex} guardado [Duración: ${cycleData.durationHours.toFixed(2)} hrs] [Profit: ${cycleData.netProfit.toFixed(2)} USDT]`);
        
        return newCycle;
    } catch (error) {
        console.error('[CYCLE_LOG] ❌ Error de validación contra el Schema:', error.message);
        return null; 
    }
}

module.exports = { logSuccessfulCycle };