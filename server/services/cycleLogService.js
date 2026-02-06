// BSB/server/services/cycleLogService.js

const TradeCycle = require('../models/TradeCycle');

/**
 * Registra un resumen de un ciclo de trading exitoso.
 * @param {object} data - Datos del ciclo (inversión, ganancia, duración, etc.)
 */
async function logSuccessfulCycle(data) {
    try {
        const newCycle = new TradeCycle(data);
        await newCycle.save();
        return newCycle;
    } catch (error) {
        console.error('Error al guardar el ciclo de trading:', error);
        // Opcional: Lanzar error o manejar logging
        return null; 
    }
}

module.exports = {
    logSuccessfulCycle
};