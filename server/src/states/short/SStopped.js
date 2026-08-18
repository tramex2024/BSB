/**
 * BSB/server/src/states/short/SStopped.js
 * S-STOPPED STATE (SHORT):
 * Monitors if there is pending debt (sac > 0) while the Short strategy is turned off.
 * Implements log throttling per user to prevent Dashboard saturation.
 */

// Persistent map for log frequency control per userId
// 🟢 AUDIT: Optimal data structure for user segmentation in Node.js.
const userLastLogTimes = new Map();

async function run(dependencies) {
    const { userId, log, botState } = dependencies;
    const now = Date.now();
    const userKey = userId.toString();

    // 1. SPAM CONTROL: Retrieve the timestamp of the last log for this user
    const lastLogTime = userLastLogTimes.get(userKey) || 0;

    // Log every 10 minutes per user to prevent socket/DB saturation
    if (now - lastLogTime < 600000) return;

    // 2. DEBT VERIFICATION (sac = Short Accumulated Coins)
    const ac = parseFloat(botState.sac || 0);

    if (ac > 0) {
        // RISK ALERT: There is BTC debt but the bot is stopped.
        // 🟢 AUDIT: The message is specific and urgent, indicating to the user that risk management is inactive.
        log(`[S-STOPPED] ⚠️ Short strategy stopped with active debt (${ac.toFixed(8)} BTC). The bot is NOT managing Buyback or DCA. High risk if price rises!`, 'warning');
    } else {
        // Silent heartbeat on server console (for cycle debugging without disturbing the user)
        console.log(`[SYS-HB] Short Stopped - User: ${userId} - No debt found.`);
    }

    // 3. TIMESTAMP UPDATE AND CLEANUP
    userLastLogTimes.set(userKey, now);

    // Preventive maintenance: if map is too large, clean old records (> 2h)
    // 🟢 AUDIT: Essential to prevent memory leaks in servers managing >1000 active concurrent users.
    if (userLastLogTimes.size > 1000) {
        for (const [key, time] of userLastLogTimes) {
            if (now - time > 7200000) userLastLogTimes.delete(key);
        }
    }
}

module.exports = { run };