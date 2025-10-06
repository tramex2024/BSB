// BSB/server/src/states/long/LStopped.js (CORREGIDO - Inicialización de Parámetros)

const Autobot = require('../../../models/Autobot');

const LSTATE = 'long';

/**
 * Resetea todos los parámetros de estado de la posición Long.
 * Esto asegura que al reiniciar el bot, comience un ciclo completamente nuevo.
 */
async function resetLState(log, updateGeneralBotState) {
    const resetLStateData = { 
        ac: 0, ppc: 0, 
        orderCountInCycle: 0, 
        lastOrder: null, 
        pm: 0, pc: 0, 
        requiredCoverageAmount: 0, 
        nextCoveragePrice: 0 
    };

    // 1. Resetear los datos de estado específicos
    await Autobot.findOneAndUpdate({}, { 'lStateData': resetLStateData });

    // 2. Resetear los campos de estado general (para el Front-End)
    const updateGeneral = {
        ltprice: 0,
        lcoverage: 0,
        lnorder: 0
        // Nota: El lbalance y lcycle NO se resetean aquí, solo el estado de la posición.
    };
    
    // Usamos la función inyectada para actualizar el estado general
    if (updateGeneralBotState) {
        await updateGeneralBotState(updateGeneral);
    }
    
    log('Parámetros de posición Long reseteados a cero (Ciclo de trading limpio).', 'warning');
}


async function run(dependencies) {
    const { log, updateGeneralBotState } = dependencies;

    log("Estado Long: STOPPED. Deteniendo el monitoreo y reseteando posición...", 'info');
    
    // 💡 CRÍTICO: Llamamos a la función de reseteo al entrar en estado STOPPED
    await resetLState(log, updateGeneralBotState);
    
    // El estado del bot ya es 'STOPPED', no es necesario hacer un updateBotState.
}

module.exports = { 
    run,
    resetLState // Exportamos por si se necesita desde otro lado (ej. un forzado de reset)
};