// BSB/server/src/states/short/SStopped.js (INVERTIDO DE LStopped.js)

async function run(dependencies) {
    // EXTRAEMOS 'log' DE LAS DEPENDENCIAS
    const { log } = dependencies;
    
    // Cambiamos el mensaje para reflejar la estrategia Short
    log("Estado Short: STOPPED. El bot está inactivo.", 'info');
    // La lógica de reactivación (si existe) se manejaría externamente o con otra función.
}

module.exports = { run };