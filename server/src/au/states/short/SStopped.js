// BSB/server/src/au/states/short/SStopped.js (ESPEJO DE LStopped.js)

/**
 * Estado Short: STOPPED.
 * El bot ha sido detenido por el usuario o por la configuración 'stopAtCycle'.
 */
async function run(dependencies) {
    const { log } = dependencies;
    
    // Loguear que el bot Short está detenido. 
    // Mantenemos la persistencia de datos intacta para permitir reanudación manual.
    log("Estado Short: STOPPED. Bot detenido. Esperando acción del usuario (START/RESET).", 'info');
    
    // Al igual que en Long, no realizamos ninguna limpieza automática aquí
    // para evitar la pérdida de registro de activos en corto pendientes.
}

module.exports = { run };