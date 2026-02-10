// BSB/server/src/au/states/long/LStopped.js

/**
 * L-STOPPED STATE:
 * Monitorea si hay posiciones abiertas mientras la estrategia está apagada.
 * Evita el spam de logs pero mantiene la alerta crítica por usuario.
 */

// Mapa persistente en memoria del proceso para control de frecuencia de logs
const lastLogTimes = new Map();

async function run(dependencies) {
    const { userId, log, botState } = dependencies;
    const now = Date.now();

    const userKey = userId.toString();
    const userLastLog = lastLogTimes.get(userKey) || 0;

    // 1. CONTROL DE SPAM: Solo actuamos cada 10 minutos por usuario
    if (now - userLastLog < 600000) return;

    // 2. DETECCIÓN DE POSICIONES HUÉRFANAS
    const ac = parseFloat(botState.lac || 0);

    if (ac > 0) {
        // Alerta visible para el usuario en su Dashboard
        log(`[L-STOPPED] ⚠️ Bot detenido con posición activa (${ac.toFixed(6)} BTC). TP y DCA desactivados. Requiere atención manual.`, 'warning');
    } else {
        // Log interno del sistema (no molesta al usuario)
        console.log(`[SYS] Strategy Stopped - User: ${userId} - No orphans found.`);
    }

    // 3. ACTUALIZACIÓN DE ÚLTIMO LOG
    lastLogTimes.set(userKey, now);

    // 4. MANTENIMIENTO DEL MAP (Evitar fuga de memoria)
    // Realizamos limpieza solo si el mapa es grande, de forma asíncrona o esporádica
    if (lastLogTimes.size > 1000) {
        // Limpiamos entradas con más de 2 horas de antigüedad
        for (const [key, time] of lastLogTimes) {
            if (now - time > 7200000) {
                lastLogTimes.delete(key);
            }
        }
    }
}

module.exports = { run };