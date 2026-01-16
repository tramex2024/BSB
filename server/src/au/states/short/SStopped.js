// BSB/server/src/au/states/short/SStopped.js

let lastLogTime = 0;

async function run(dependencies) {
    const { log, botState } = dependencies;
    const now = Date.now();

    // Solo loguear una vez cada 10 minutos para no saturar la base de datos/UI
    if (now - lastLogTime < 600000) return;

    // En Short, si 'ac' (Amount Coin) es mayor a 0, significa que debes BTC al exchange
    if (botState.sStateData && botState.sStateData.ac > 0) {
        log(`[S-STOPPED] ⚠️ Short detenido con deuda abierta (${botState.sStateData.ac.toFixed(8)} BTC). ¡Peligro si el precio sube! Requiere cierre manual.`, 'warning');
        lastLogTime = now;
    } else {
        // Log discreto si no hay riesgo
        console.log("[S-STOPPED] Estrategia Short en pausa.");
        lastLogTime = now;
    }
}

module.exports = { run };