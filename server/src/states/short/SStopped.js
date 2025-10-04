// BSB/server/src/states/short/SStopped.js (Réplica de LStopped.js)

async function run(dependencies) {
    // EXTRAEMOS 'log' DE LAS DEPENDENCIAS
    const { log } = dependencies;
    
    // Cambiamos el mensaje para reflejar la estrategia Short
    log("Estado Short: STOPPED. El bot está inactivo.", 'info');
    // No hay lógica adicional, el bot simplemente se detiene
}

module.exports = { run };