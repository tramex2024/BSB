// BSB/server/src/au/states/long/LStopped.js (CORREGIDO - Solo espera)

async function run(dependencies) {
    const { log } = dependencies;
    
    // Loguear que el bot está detenido, pero no hacer nada más.
    log("Estado Long: STOPPED. Bot detenido. Esperando acción del usuario (START/RESET).", 'info');
    
    // NOTA: No hacemos 'await resetLState' aquí.
}

module.exports = { run };