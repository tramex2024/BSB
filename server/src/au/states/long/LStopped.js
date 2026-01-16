// BSB/server/src/au/states/long/LStopped.js
let lastLogTime = 0;

async function run(dependencies) {
    const { log, botState } = dependencies;
    const now = Date.now();

    // Solo loguear una vez cada 10 minutos (600,000 ms) para no saturar
    if (now - lastLogTime < 600000) return;

    if (botState.lStateData && botState.lStateData.ac > 0) {
        log(`[L-STOPPED] ⚠️ Bot detenido con posición abierta (${botState.lStateData.ac.toFixed(8)} BTC). Requiere intervención manual.`, 'warning');
        lastLogTime = now;
    } else {
        // Log de debug silencioso o cada mucho tiempo
        console.log("[L-STOPPED] En espera..."); 
        lastLogTime = now;
    }
}