// BSB/server/src/au/states/short/SStopped.js

let lastLogTime = 0;

async function run(dependencies) {
    const { log, botState } = dependencies;
    const now = Date.now();

    // Solo loguear una vez cada 10 minutos para no saturar la base de datos/UI
    if (now - lastLogTime < 600000) return;

    // ✅ MIGRADO: Acceso directo a 'sac' en la raíz
    const ac = parseFloat(botState.sac || 0);

    // En Short, si 'sac' (Short Accumulated) es mayor a 0, significa que vendiste BTC 
    // que ahora debes recomprar para cerrar la posición.
    if (ac > 0) {
        log(`[S-STOPPED] ⚠️ Short detenido con deuda abierta (${ac.toFixed(8)} BTC). El bot NO está gestionando el Trailing Stop ni el DCA. ¡Peligro si el precio sube! Requiere cierre manual.`, 'warning');
        lastLogTime = now;
    } else {
        // Log discreto en consola si el bot está pausado pero limpio de deuda
        console.log("[S-STOPPED] Estrategia Short en pausa y sin posición abierta.");
        lastLogTime = now;
    }
}

module.exports = { run };