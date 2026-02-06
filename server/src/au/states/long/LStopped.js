// BSB/server/src/au/states/long/LStopped.js

let lastLogTime = 0;

async function run(dependencies) {
    const { log, botState } = dependencies;
    const now = Date.now();

    // Log only once every 10 minutes to avoid cluttering
    if (now - lastLogTime < 600000) return;

    // ✅ MIGRATED: Direct access to lac (Long Accumulated Coins) in root
    const ac = parseFloat(botState.lac || 0);

    if (ac > 0) {
        // Critical alert: Coins are held but the bot side is stopped.
        log(`[L-STOPPED] ⚠️ Bot stopped with open position (${ac.toFixed(8)} BTC). Take Profit and DCA are NOT being managed. Manual intervention required!`, 'warning');
        lastLogTime = now;
    } else {
        // Internal silent log to confirm lifecycle activity
        console.log("[L-STOPPED] Long side inactive with no open position."); 
        lastLogTime = now;
    }
}

module.exports = { run };