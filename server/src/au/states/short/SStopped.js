let lastLogTime = 0;

async function run(dependencies) {
    const { log, botState } = dependencies;
    const now = Date.now();

    // Log only once every 10 minutes to avoid DB/UI clutter
    if (now - lastLogTime < 600000) return;

    // ✅ MIGRATED: Direct access to 'sac' in root
    const ac = parseFloat(botState.sac || 0);

    // In Short, if 'sac' > 0, it means you sold BTC 
    // that you must now buy back to close the position.
    if (ac > 0) {
        log(`[S-STOPPED] ⚠️ Short stopped with open debt (${ac.toFixed(8)} BTC). Bot is NOT managing Trailing Stop or DCA. Risk if price rises! Manual closure required.`, 'warning');
        lastLogTime = now;
    } else {
        // Discreet console log if the bot is paused but clean of debt
        console.log("[S-STOPPED] Short strategy paused with no open position.");
        lastLogTime = now;
    }
}

module.exports = { run };