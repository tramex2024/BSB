/**
 * SHORT STRATEGY - STATE MACHINE (BSB 2026)
 * Life cycle management for Sell/Buyback operations with panic mitigation.
 */

const SRunning = require('./states/short/SRunning'); // Entry scan
const SSelling = require('./states/short/SSelling'); // DCA (BTC Short Selling)
const SBuying  = require('./states/short/SBuying');  // Take Profit (BTC Buyback)
const SPaused  = require('./states/short/SPaused');
const SStopped = require('./states/short/SStopped');

/**
 * Executes the corresponding logic based on the current Short state.
 * @param {Object} dependencies - Atomic context injection per user.
 */
async function runShortStrategy(dependencies) {
    // 1. Integrity verification (Fail-fast)
    if (!dependencies || !dependencies.botState || !dependencies.userId) return;

    const { botState, userId, log, updateBotState } = dependencies;
    const currentState = botState.sstate || 'STOPPED';

    try {
        /**
         * SHORT STATE MACHINE
         * We delegate execution to specialized submodules. 
         */
        switch (currentState) {
            case 'RUNNING':
                // Looking for overbought conditions (high RSI) or a drop signal
                await SRunning.run(dependencies);
                break;

            case 'SELLING': 
                // Executing initial sale or increasing position size (Short DCA)
                await SSelling.run(dependencies);
                break;

            case 'BUYING':
                // Monitoring price to buyback with profit (Take Profit)
                await SBuying.run(dependencies);
                break;

            case 'PAUSED':
                // Waiting state due to insufficient collateral or API error
                await SPaused.run(dependencies);
                break;

            case 'STOPPED':
                // Inactive state
                await SStopped.run(dependencies);
                break;

            default:
                log(`⚠️ Unknown Short state: ${currentState}`, 'error');
                break;
        }
    } catch (error) {
        // [EMERGENCY PROTECTION]: Isolate the error and prevent infinite CPU/Network loops in Short operations.
        log(`🔥 Critical error in ShortStrategy [${currentState}]: ${error.message}`, 'error');
        console.error(`[CRITICAL-SHORT][User: ${userId}]:`, error);

        // If the error occurs in an active transactional state, pause the bot to freeze market exposure
        if (currentState === 'BUYING' || currentState === 'SELLING' || currentState === 'RUNNING') {
            try {
                log(`🚨 [SHORT FALLBACK ACTIVATED] Forcing emergency transition [${currentState} ➡️ PAUSED] to mitigate risks in Short mode.`, 'warning');
                if (typeof updateBotState === 'function') {
                    await updateBotState('PAUSED', 'short');
                } else {
                    // Direct database backup fallback if the atomic dependency wrapper does not respond
                    botState.sstate = 'PAUSED';
                }
            } catch (fallbackError) {
                console.error(`💥 [SUPER-CRITICAL-SHORT] Short panic mitigation system failed for user ${userId}:`, fallbackError.message);
            }
        }
    }
}

module.exports = {
    runShortStrategy
};