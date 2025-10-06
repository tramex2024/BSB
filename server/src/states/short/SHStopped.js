// BSB/server/src/states/short/SHStopped.js

async function run(dependencies) {
    const { log } = dependencies;
    log("Estado Short: STOPPED. El bot está inactivo.", 'info');
}

module.exports = { run };