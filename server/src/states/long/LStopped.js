/**
 * BSB/server/src/au/states/long/LStopped.js
 * L-STOPPED STATE:
 * Monitors if there are open positions while the strategy is turned off.
 * Prevents log spam while maintaining critical user alerts.
 */

// Persistent in-memory map for log frequency control per userId
// 🟢 AUDIT: Using a Map is efficient for userId lookup (userKey)
const lastLogTimes = new Map();

async function run(dependencies) {
    const { userId, log, botState } = dependencies;
    const now = Date.now();

    const userKey = userId.toString();
    const userLastLog = lastLogTimes.get(userKey) || 0;

    // 1. SPAM CONTROL: Only act every 10 minutes per user
    if (now - userLastLog < 600000) return;

    // 2. ORPHAN POSITION DETECTION
    const ac = parseFloat(botState.lac || 0);

    if (ac > 0) {
        // Visible alert for the user on their Dashboard
        // 🟢 AUDIT: Important to prevent the user from forgetting "trapped" assets without risk management.
        log(`[L-STOPPED] ⚠️ Bot stopped with active position (${ac.toFixed(6)} BTC). TP and DCA disabled. Manual attention required.`, 'warning');
    } else {
        // Internal system log (does not disturb the user)
        console.log(`[SYS] Strategy Stopped - User: ${userId} - No orphans found.`);
    }

    // 3. UPDATE LAST LOG TIMESTAMP
    lastLogTimes.set(userKey, now);

    // 4. MAP MAINTENANCE (Prevent memory leaks)
    // Cleanup performed only when the map is large, asynchronously or sporadically
    // 🟢 AUDIT: Critical in multi-user environments to maintain server stability.
    if (lastLogTimes.size > 1000) {
        // Clean entries older than 2 hours
        for (const [key, time] of lastLogTimes) {
            if (now - time > 7200000) {
                lastLogTimes.delete(key);
            }
        }
    }
}

module.exports = { run };