//BSB/server/src/au/states/short/SStopped.js

/**
 * S-STOPPED STATE (SHORT):
 * Monitorea si hay deuda de BTC pendiente (sac > 0) mientras la estrategia Short está apagada.
 * Implementa un sistema de logs por usuario para evitar saturación.
 */

// Usamos un Map para que el tiempo de espera sea independiente por cada userId
const userLastLogTimes = new Map();

async function run(dependencies) {
    const { userId, log, botState } = dependencies;
    const now = Date.now();

    // Recuperamos el tiempo del último log de este usuario específico
    const lastLogTime = userLastLogTimes.get(userId.toString()) || 0;

    // Log solo una vez cada 10 minutos por usuario para evitar saturar el Dashboard
    if (now - lastLogTime < 600000) return;

    // ✅ MIGRATED: Acceso directo a 'sac' (Short Accumulated Coins) en la raíz
    const ac = parseFloat(botState.sac || 0);

    // En Short, si 'sac' > 0, tienes una deuda que recomprar.
    if (ac > 0) {
        log(`[S-STOPPED] ⚠️ Short stopped with open debt (${ac.toFixed(8)} BTC). Bot is NOT managing Trailing Stop or DCA. Risk if price rises! Manual closure required.`, 'warning');
        userLastLogTimes.set(userId.toString(), now);
    } else {
        // Log discreto en la consola del servidor para confirmar que el bot sigue vivo
        console.log(`[S-STOPPED] [User: ${userId}] Short strategy paused with no open position.`);
        userLastLogTimes.set(userId.toString(), now);
    }
}

module.exports = { run };