// BSB/server/src/au/states/short/SStopped.js

/**
 * S-STOPPED STATE (SHORT):
 * Monitorea si hay deuda pendiente (sac > 0) mientras la estrategia Short está apagada.
 * Implementa throttling de logs por usuario para no saturar el Dashboard.
 */

// Mapa persistente para control de frecuencia de logs por userId
const userLastLogTimes = new Map();

async function run(dependencies) {
    const { userId, log, botState } = dependencies;
    const now = Date.now();
    const userKey = userId.toString();

    // 1. CONTROL DE SPAM: Recuperamos el tiempo del último log de este usuario
    const lastLogTime = userLastLogTimes.get(userKey) || 0;

    // Log cada 10 minutos por usuario
    if (now - lastLogTime < 600000) return;

    // 2. VERIFICACIÓN DE DEUDA (sac = Short Accumulated Coins)
    const ac = parseFloat(botState.sac || 0);

    if (ac > 0) {
        // ALERTA DE RIESGO: Hay deuda de BTC pero el bot está apagado.
        log(`[S-STOPPED] ⚠️ Estrategia Short detenida con deuda activa (${ac.toFixed(8)} BTC). El bot NO está gestionando Recompra ni DCA. ¡Riesgo alto si el precio sube!`, 'warning');
    } else {
        // Heartbeat silencioso en consola de servidor
        console.log(`[SYS-HB] Short Stopped - User: ${userId} - No debt found.`);
    }

    // 3. ACTUALIZACIÓN DE TIEMPO Y LIMPIEZA
    userLastLogTimes.set(userKey, now);

    // Mantenimiento preventivo: si el mapa es muy grande, limpiamos registros viejos (> 2h)
    if (userLastLogTimes.size > 1000) {
        for (const [key, time] of userLastLogTimes) {
            if (now - time > 7200000) userLastLogTimes.delete(key);
        }
    }
}

module.exports = { run };