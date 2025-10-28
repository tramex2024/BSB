// BSB/server/src/states/short/SStopped.js (Solo espera)

async function run(dependencies) {
    const { log } = dependencies;
    
    // Loguear que el bot está detenido, pero no hacer nada más.
    log("[SHORT] Estado Short: STOPPED. Estrategia detenida. Esperando acción del usuario (START/RESET).", 'info');
    
    // NOTA: No se realiza ninguna acción automatizada ni se modifica el estado.
}

module.exports = { run };