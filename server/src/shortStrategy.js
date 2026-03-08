/**
 * SHORT STRATEGY - STATE MACHINE (BSB 2026)
 * Life cycle management for Sell/Buyback operations.
 */

const SRunning = require('./au/states/short/SRunning'); 
const SSelling = require('./au/states/short/SSelling'); 
const SBuying  = require('./au/states/short/SBuying');  
const SPaused  = require('./au/states/short/SPaused');
const SStopped = require('./au/states/short/SStopped');

async function runShortStrategy(dependencies) {
    if (!dependencies || !dependencies.botState) return;

    const { botState, userId, log, availableBTC } = dependencies;
    const currentState = botState.sstate || 'STOPPED';

    // 🟢 AUDIT: Safety check for missing BTC balance injection
    if (currentState === 'SELLING' && availableBTC === undefined) {
        log(`🔥 [CRITICAL] availableBTC is undefined in dependencies. Check Orchestrator.`, 'error');
    }

    try {
        switch (currentState) {
            case 'RUNNING':
                await SRunning.run(dependencies);
                break;

            case 'SELLING': 
                await SSelling.run(dependencies);
                break;

            case 'BUYING':
                await SBuying.run(dependencies);
                break;

            case 'PAUSED':
                await SPaused.run(dependencies);
                break;

            case 'STOPPED':
                await SStopped.run(dependencies);
                break;

            default:
                log(`⚠️ Unknown Short state: ${currentState}`, 'error');
                break;
        }
    } catch (error) {
        log(`🔥 ShortStrategy Error [${currentState}]: ${error.message}`, 'error');
        console.error(`[CRITICAL-SHORT][User: ${userId}]:`, error);
    }
}

module.exports = { runShortStrategy };