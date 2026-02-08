// BSB/server/src/au/states/long/LStopped.js

/**
 * L-STOPPED STATE:
 * Monitorea si hay posiciones abiertas mientras la estrategia está apagada.
 * Evita el spam de logs pero mantiene la alerta crítica por usuario.
 */

// Usamos un Map para rastrear el tiempo del último log por cada usuario individualmente
const lastLogTimes = new Map();

async function run(dependencies) {
    const { userId, log, botState } = dependencies;
    const now = Date.now();

    // Recuperamos el último log de este usuario específico
    const userLastLog = lastLogTimes.get(userId.toString()) || 0;

    // Log solo una vez cada 10 minutos por usuario para evitar saturación
    if (now - userLastLog < 600000) return;

    // ✅ MIGRATED: Direct access to lac (Long Accumulated Coins)
    const ac = parseFloat(botState.lac || 0);

    if (ac > 0) {
        // Alerta crítica: Hay monedas pero el bot está apagado.
        log(`[L-STOPPED] ⚠️ Bot stopped with open position (${ac.toFixed(8)} BTC). Take Profit and DCA are NOT being managed. Manual intervention required!`, 'warning');
        lastLogTimes.set(userId.toString(), now);
    } else {
        // Log de consola (servidor) para depuración, indicando qué usuario está inactivo
        console.log(`[L-STOPPED] [User: ${userId}] Long side inactive with no open position.`); 
        lastLogTimes.set(userId.toString(), now);
    }

    // Limpieza opcional del Map si crece demasiado (puedes omitir si no esperas miles de usuarios simultáneos)
    if (lastLogTimes.size > 1000) lastLogTimes.clear();
}

module.exports = { run };