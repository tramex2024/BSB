// BSB/server/src/states/long/LStopped.js (CORREGIDO - Inicialización Completa de Parámetros)

const Autobot = require('../../../models/Autobot');

/**
 * Resetea todos los parámetros de estado de la posición Long.
 */
async function resetLState(log, updateGeneralBotState) {
    const resetLStateData = { 
        ppc: 0, 
        ac: 0, 
        ppv: 0, // Incluido del esquema
        av: 0,  // Incluido del esquema
        orderCountInCycle: 0, 
        lastOrder: null, 
        pm: 0, 
        pc: 0, 
        pv: 0,  // 💡 CRÍTICO: Aseguramos el reseteo de pv
        requiredCoverageAmount: 0, 
        nextCoveragePrice: 0 
        // Nota: el _id del subdocumento NO se toca.
    };

    // 1. Resetear los datos de estado específicos (lStateData)
    // El update solo actualiza los campos definidos en resetLStateData.
    await Autobot.findOneAndUpdate({}, { 'lStateData': resetLStateData });

    // 2. Resetear los campos de estado general relacionados con la posición
    const updateGeneral = {
        ltprice: 0,
        lcoverage: 0,
        lnorder: 0
        // No reseteamos lbalance, lcycle, totalProfit aquí
    };
    
    if (updateGeneralBotState) {
        await updateGeneralBotState(updateGeneral);
    }
    
    log('Parámetros de posición Long reseteados a cero (Ciclo de trading limpio).', 'warning');
}


async function run(dependencies) {
    const { log, updateGeneralBotState } = dependencies;

    log("Estado Long: STOPPED. Deteniendo el monitoreo y reseteando posición...", 'info');
    
    await resetLState(log, updateGeneralBotState);
}

module.exports = { 
    run,
    resetLState
};