// BSB/server/src/states/long/LStopped.js

// const autobotCore = require('../../../autobotLogic'); // ELIMINADO para evitar dependencia circular

async function run(dependencies) {
    // EXTRAEMOS 'log' DE LAS DEPENDENCIAS
    const { log } = dependencies;
    log("Estado Long: STOPPED. El bot está inactivo.", 'info');
    // No hay lógica adicional, el bot simplemente se detiene
}

module.exports = { run };