// BSB/server/src/states/short/SHStopped.js (CORREGIDO - Inicialización Completa de Parámetros)

const Autobot = require('../../../models/Autobot');

/**
 * Resetea todos los parámetros de estado de la posición Short.
 */
async function resetSState(log, updateGeneralBotState) {
    const resetSStateData = { 
        ppc: 0, 
        ac: 0, 
        ppv: 0, // Incluido del esquema
        av: 0,  // Incluido del esquema
        orderCountInCycle: 0, 
        lastOrder: null, 
        pm: 0, 
        pc: 0, 
        pv: 0, // 💡 CRÍTICO: Aseguramos el reseteo de pv
        requiredCoverageAmount: 0, 
        nextCoveragePrice: 0 
    };

    // 1. Resetear los datos de estado específicos (sStateData)
    await Autobot.findOneAndUpdate({}, { 'sStateData': resetSStateData });

    // 2. Resetear los campos de estado general relacionados con la posición
    const updateGeneral = {
        stprice: 0,
        scoverage: 0,
        snorder: 0
        // No reseteamos sbalance, scycle, totalProfit aquí
    };
    
    if (updateGeneralBotState) {
        await updateGeneralBotState(updateGeneral);
    }
    
    log('Parámetros de posición Short reseteados a cero (Ciclo de trading limpio).', 'warning');
}


async function run(dependencies) {
    const { log, updateGeneralBotState } = dependencies;

    log("Estado Short: STOPPED. Deteniendo el monitoreo y reseteando posición...", 'info');
    
    await resetSState(log, updateGeneralBotState);
}

module.exports = { 
    run,
    resetSState
};