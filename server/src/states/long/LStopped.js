// BSB/server/src/states/long/LStopped.js

const autobotCore = require('../../autobotLogic');

async function run(dependencies) {
    autobotCore.log("Estado Long: STOPPED. El bot está inactivo.", 'info');
    // No hay lógica adicional, el bot simplemente se detiene
}

module.exports = { run };