// BSB/server/src/au/states/long/LStopped.js

async function run(dependencies) {
    const { log, botState } = dependencies;
    
    // Solo logueamos en nivel 'info' si es necesario, para evitar saturar el historial 
    // en cada tick del bot mientras está apagado.
    if (botState.lStateData && botState.lStateData.ac > 0) {
        log(`[L-STOPPED] ⚠️ Bot detenido con posición abierta (${botState.lStateData.ac.toFixed(8)} BTC). Requiere intervención manual.`, 'warning');
    } else {
        log("[L-STOPPED] 🛑 Estrategia Long detenida. Esperando comando START/RESET.", 'debug');
    }
    
    // El bot se queda aquí "congelado" intencionalmente.
    // La transición a RUNNING o BUYING solo ocurrirá cuando el usuario 
    // cambie el 'state' en la base de datos a través del Dashboard.
}

module.exports = { run };