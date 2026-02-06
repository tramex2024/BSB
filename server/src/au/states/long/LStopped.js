// BSB/server/src/au/states/long/LStopped.js
let lastLogTime = 0;

async function run(dependencies) {
    const { log, botState } = dependencies;
    const now = Date.now();

    // Solo loguear una vez cada 10 minutos para no saturar los logs
    if (now - lastLogTime < 600000) return;

    // Acceso seguro al estado de los datos (ac = Accumulated Coins)
    const lStateData = botState.lStateData || {};
    const ac = lStateData.ac || 0;

    if (ac > 0) {
        // Si hay posición abierta y el bot está en STOPPED, es un riesgo de pérdida
        log(`[L-STOPPED] ⚠️ Bot detenido con posición abierta (${ac.toFixed(8)} BTC). El bot NO está gestionando el Take Profit ni el DCA. Requiere intervención manual.`, 'warning');
        lastLogTime = now;
    } else {
        // Log de consola interno para confirmar que el ciclo de vida sigue activo
        console.log("[L-STOPPED] En espera... Lado Long inactivo y sin posición."); 
        lastLogTime = now;
    }
}

module.exports = { run };