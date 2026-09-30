/**
 * LONG STRATEGY - STATE MACHINE (BSB 2026)
 * Safe life cycle management of Long positions with panic mitigation.
 * Protegido contra desconexiones temporales de red/DNS (2026).
 */

const LRunning = require('./states/long/LRunning');
const LBuying  = require('./states/long/LBuying');
const LSelling = require('./states/long/LSelling');
const LPaused  = require('./states/long/LPaused');
const LStopped = require('./states/long/LStopped');

// 🟢 Helper estandarizado para detectar errores temporales de red/DNS
const isNetworkError = (err) => {
    const msg = err?.message || '';
    return err?.code === 'ENOTFOUND' || 
           err?.code === 'ETIMEDOUT' || 
           err?.code === 'ECONNRESET' || 
           msg.includes('ENOTFOUND') || 
           msg.includes('Request Failed') ||
           msg.includes('Network');
};

/**
 * Executes the corresponding step of the Long State Machine.
 * @param {Object} dependencies - Receives dependencies directly from autobotLogic.
 */
async function runLongStrategy(dependencies) {
    // 1. Integrity verification (Fail-fast)
    if (!dependencies || !dependencies.botState || !dependencies.userId) {
        return; 
    }

    const { botState, log, userId, updateBotState } = dependencies;
    const currentState = botState.lstate || 'STOPPED';

    try {
        /**
         * STATE MACHINE PATTERN
         * We delegate heavy execution logic to specialized submodules.
         */
        switch (currentState) {
            case 'RUNNING':
                // Scan input signals (MarketSignal)
                await LRunning.run(dependencies);
                break;
                
            case 'BUYING':
                // Execution of buy orders (Initial or DCA)
                await LBuying.run(dependencies);
                break;
                
            case 'SELLING':
                // Monitoring of Take Profit and Trailings
                await LSelling.run(dependencies);
                break;
                
            case 'PAUSED':
                // Safety buffer (Insufficient funds or API error)
                await LPaused.run(dependencies);
                break;
                
            case 'STOPPED':
                // Inactive state
                await LStopped.run(dependencies);
                break;
                
            default:
                log(`⚠️ Unknown Long state: ${currentState}`, 'error');
                break;
        }
    } catch (error) {
        // [EMERGENCY PROTECTION]: Isolate the error and prevent infinite CPU loops.
        log(`🔥 Critical error in LongStrategy [${currentState}]: ${error.message}`, 'error');
        console.error(`[CRITICAL-LONG][User: ${userId}]:`, error);

        // 🟢 Solo forzar la pausa de emergencia si NO fue un error temporal de red/DNS
        if (!isNetworkError(error) && (currentState === 'BUYING' || currentState === 'SELLING' || currentState === 'RUNNING')) {
            try {
                log(`🚨 [FALLBACK ACTIVATED] Forcing emergency transition [${currentState} ➡️ PAUSED] to prevent cycle corruption.`, 'warning');
                if (typeof updateBotState === 'function') {
                    await updateBotState('PAUSED', 'long');
                } else {
                    // Direct database backup fallback if the atomic dependency wrapper does not respond
                    botState.lstate = 'PAUSED';
                }
            } catch (fallbackError) {
                console.error(`💥 [SUPER-CRITICAL] User ${userId} panic mitigation system failed:`, fallbackError.message);
            }
        }
    }
}

module.exports = {
    runLongStrategy
};