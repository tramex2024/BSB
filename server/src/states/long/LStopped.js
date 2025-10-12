// BSB/server/src/states/long/LStopped.js (CORREGIDO - Inicialización Completa de Parámetros)

const Autobot = require('../../../models/Autobot');

/**
 * Resetea todos los parámetros de estado de la posición Long.
 */
async function resetLState(log, updateGeneralBotState) {
    
    // 1. Definir los campos que DEBEN ser reseteados en lStateData
    // Incluí todos los campos que tiene el subdocumento en tu DB, asegurando pm y pc.
    const fieldsToReset = { 
        'lStateData.ppc': 0,
        'lStateData.ac': 0,
        'lStateData.ppv': 0, 
        'lStateData.av': 0, 
        'lStateData.orderCountInCycle': 0, 
        'lStateData.lastOrder': null, // Importante: resetear lastOrder a null
        'lStateData.pm': 0, // 💡 CAMPO pm RESETEADO
        'lStateData.pc': 0, // 💡 CAMPO pc RESETEADO
        'lStateData.requiredCoverageAmount': 0, 
        'lStateData.nextCoveragePrice': 0 
        // Nota: Si 'pv' existe en tu esquema, debes incluirlo aquí: 'lStateData.pv': 0,
    };

    // 2. Ejecutar el reseteo de campos específicos dentro del subdocumento
    // Usamos $set para actualizar solo los campos deseados dentro del subdocumento.
    await Autobot.findOneAndUpdate({}, { $set: fieldsToReset });

    // 3. Resetear los campos de estado general relacionados con la posición
    const updateGeneral = {
        ltprice: 0,
        lcoverage: 0,
        lnorder: 0
        // No reseteamos lbalance, lcycle, totalProfit aquí
    };
    
    if (updateGeneralBotState) {
        // Asumiendo que updateGeneralBotState maneja la actualización
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