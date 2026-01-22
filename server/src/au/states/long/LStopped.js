// BSB/server/src/au/states/long/LStopped.js
let lastLogTime = 0;

async function run(dependencies) {
    const { log, botState } = dependencies;
    const now = Date.now();

    // Solo loguear una vez cada 10 minutos para no saturar los logs
    if (now - lastLogTime < 600000) return;

    // ✅ MIGRADO: Acceso directo a lac (Long Accumulated Coins) en la raíz
    const ac = parseFloat(botState.lac || 0);

    if (ac > 0) {
        // Alerta crítica: Hay monedas compradas pero el bot está apagado.
        log(`[L-STOPPED] ⚠️ Bot detenido con posición abierta (${ac.toFixed(8)} BTC). El bot NO está gestionando el Take Profit ni el DCA. Requiere intervención manual.`, 'warning');
        lastLogTime = now;
    } else {
        // Log de consola interno (silencioso) para confirmar que el ciclo de vida sigue activo
        console.log("[L-STOPPED] Lado Long inactivo y sin posición abierta."); 
        lastLogTime = now;
    }
}

module.exports = { run };