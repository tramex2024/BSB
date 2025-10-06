// BSB/server/src/states/short/SHStopped.js (CORREGIDO - Inicialización de Parámetros)

const Autobot = require('../../../models/Autobot');

const SSTATE = 'short';

/**
 * Resetea todos los parámetros de estado de la posición Short.
 * Esto asegura que al reiniciar el bot, comience un ciclo completamente nuevo.
 */
async function resetSState(log, updateGeneralBotState) {
    const resetSStateData = { 
        ac: 0, ppc: 0, 
        orderCountInCycle: 0, 
        lastOrder: null, 
        pm: 0, pc: 0, 
        requiredCoverageAmount: 0, 
        nextCoveragePrice: 0 
    };

    // 1. Resetear los datos de estado específicos
    await Autobot.findOneAndUpdate({}, { 'sStateData': resetSStateData });

    // 2. Resetear los campos de estado general (para el Front-End)
    const updateGeneral = {
        stprice: 0,
        scoverage: 0,
        snorder: 0
        // Nota: El sbalance y scycle NO se resetean aquí, solo el estado de la posición.
    };
    
    // Usamos la función inyectada para actualizar el estado general
    if (updateGeneralBotState) {
        await updateGeneralBotState(updateGeneral);
    }
    
    log('Parámetros de posición Short reseteados a cero (Ciclo de trading limpio).', 'warning');
}


async function run(dependencies) {
    const { log, updateGeneralBotState } = dependencies;

    log("Estado Short: STOPPED. Deteniendo el monitoreo y reseteando posición...", 'info');
    
    // 💡 CRÍTICO: Llamamos a la función de reseteo al entrar en estado STOPPED
    await resetSState(log, updateGeneralBotState);
    
    // El estado del bot ya es 'STOPPED', no es necesario hacer un updateBotState.
}

module.exports = { 
    run,
    resetSState // Exportamos por si se necesita desde otro lado
};