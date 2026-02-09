//BSB/server/src/au/states/short/SStopped.js

/**
 * S-STOPPED STATE (SHORT):
 * Monitors if there is pending BTC debt (sac > 0) while the Short strategy is disabled.
 * Implements a per-user logging system to prevent Dashboard saturation.
 */

// Use a Map to keep track of log throttling independently per userId
const userLastLogTimes = new Map();

async function run(dependencies) {
    const { userId, log, botState } = dependencies;
    const now = Date.now();

    // Retrieve last log time for this specific user
    const lastLogTime = userLastLogTimes.get(userId.toString()) || 0;

    // Log only once every 10 minutes per user to avoid saturating the User Dashboard
    if (now - lastLogTime < 600000) return;

    // ✅ MIGRATED: Direct access to 'sac' (Short Accumulated Coins) in root
    const ac = parseFloat(botState.sac || 0);

    // In Short strategy, if 'sac' > 0, there is a debt that needs buyback.
    if (ac > 0) {
        log(`[S-STOPPED] ⚠️ Short strategy stopped with open debt (${ac.toFixed(8)} BTC). Bot is NOT managing Trailing Stop or DCA. High risk if price rises! Manual closure required.`, 'warning');
        userLastLogTimes.set(userId.toString(), now);
    } else {
        // Silent server console log to confirm bot instance heartbeat
        console.log(`[S-STOPPED] [User: ${userId}] Short strategy inactive. No open positions.`);
        userLastLogTimes.set(userId.toString(), now);
    }
}

module.exports = { run };