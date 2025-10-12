// BSB/server/src/states/long/LStopped.js (CORREGIDO - Inicialización Completa de Parámetros)

const Autobot = require('../../../models/Autobot');

/**
 * Resetea todos los parámetros de estado de la posición Long de manera agresiva
 * usando $unset y luego $set, para asegurar que pm y pc se reinicien a 0.
 */
async function resetLState(log, updateGeneralBotState) {
    
    // --- PASO 1: ELIMINAR los campos problemáticos ---
    // Esto es para eliminar cualquier valor antiguo que se haya quedado persistente.
    const fieldsToUnset = {
        'lStateData.pm': "",
        'lStateData.pc': "",
        'lStateData.lastOrder': "",
    };

    try {
        await Autobot.findOneAndUpdate({}, { $unset: fieldsToUnset });
    } catch(err) {
        log('Advertencia: Fallo al ejecutar $unset en lStateData, continuando con $set.', 'error');
    }
    
    // --- PASO 2: REINICIALIZAR todos los campos a 0/null ---
    // Usamos $set para re-crear los campos con valor 0 o null.
    const fieldsToReset = { 
        'lStateData.ppc': 0,
        'lStateData.ac': 0,
        'lStateData.ppv': 0, 
        'lStateData.av': 0, 
        'lStateData.orderCountInCycle': 0, 
        'lStateData.lastOrder': null, // Re-inicializar a null
        'lStateData.pm': 0, // Re-inicializar a 0
        'lStateData.pc': 0, // Re-inicializar a 0
        'lStateData.requiredCoverageAmount': 0, 
        'lStateData.nextCoveragePrice': 0 
    };

    // Actualizar los campos dentro del subdocumento lStateData
    await Autobot.findOneAndUpdate({}, { $set: fieldsToReset });

    // 3. Resetear los campos de estado general relacionados con la posición
    const updateGeneral = {
        ltprice: 0,
        lcoverage: 0,
        lnorder: 0
    };
    
    if (updateGeneralBotState) {
        await updateGeneralBotState(updateGeneral);
    }
    
    log('Parámetros de posición Long (incluyendo PM/PC) reseteados a cero de forma agresiva.', 'warning');
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