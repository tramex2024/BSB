// BSB/server/src/au/states/long/LStopped.js

/**
 * L-STOPPED STATE:
 * Monitorea si hay posiciones abiertas mientras la estrategia está apagada.
 * Evita el spam de logs pero mantiene la alerta crítica por usuario.
 */

// Usamos un Map para rastrear el tiempo del último log por cada usuario de forma independiente
const lastLogTimes = new Map();

async function run(dependencies) {
    const { userId, log, botState } = dependencies;
    const now = Date.now();

    // Recuperamos el último log de este usuario específico (ID puro)
    const userKey = userId.toString();
    const userLastLog = lastLogTimes.get(userKey) || 0;

    // Log cada 10 minutos para no saturar el socket ni el historial del celular
    if (now - userLastLog < 600000) return;

    // Verificamos si hay "monedas huérfanas" (posición abierta sin bot que la cuide)
    const ac = parseFloat(botState.lac || 0);

    if (ac > 0) {
        // ALERTA CRÍTICA: Hay capital pero el bot está detenido.
        log(`[L-STOPPED] ⚠️ Bot detenido con posición abierta (${ac.toFixed(6)} BTC). El Take Profit y DCA NO están funcionando. ¡Se requiere atención manual!`, 'warning');
    } else {
        // Log informativo silencioso para el servidor
        console.log(`[L-STOPPED] [User: ${userId}] Inactivo sin posiciones.`);
    }

    // Actualizamos el tiempo para este usuario
    lastLogTimes.set(userKey, now);

    // Mantenimiento preventivo del Map
    if (lastLogTimes.size > 500) {
        // Si el mapa crece, eliminamos registros muy antiguos en lugar de limpiar todo
        for (let [key, time] of lastLogTimes) {
            if (now - time > 3600000) lastLogTimes.delete(key);
        }
    }
}

module.exports = { run };