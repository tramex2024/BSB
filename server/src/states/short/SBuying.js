/**
 * BSB/server/src/states/short/SBuying.js
 * Inverse Trailing Stop Management and Buyback Monitoring
 */

const { placeShortBuyOrder } = require('../../managers/shortOrderManager');
const { monitorAndConsolidateShortBuy: monitorShortBuy } = require('./ShortBuyConsolidator');

const MIN_CLOSE_AMOUNT_BTC = 0.00001; 
const SSTATE = 'short';
const TRAILING_STOP_PERCENTAGE = 0.3; // Default 0.3%

/**
 * S-BUYING STATE (SHORT):
 * Manages the inverse trailing stop to maximize the Short descent profit.
 */
async function run(dependencies) {
    const { 
        userId, 
        botState, 
        currentPrice, 
        config, 
        log, 
        updateBotState, 
        updateGeneralBotState,
        updateSStateData, 
        placeShortOrder,
        userCreds 
    } = dependencies;
    
    // Global wrapper to safeguard the execution thread
    try {
        if (!currentPrice || currentPrice <= 0) return;

        const SYMBOL = String(config.symbol || 'BTC_USDT');
        const slastOrder = botState.slastOrder;  
        const acBuying = parseFloat(botState.sac || 0); 
        const pm = parseFloat(botState.spm || 0);       // Floor (minimum price reached)
        const pc = parseFloat(botState.spc || 0);       // Buyback Stop (trigger price)

        // 1. SIMPLIFIED SAFETY LOCK
        if (slastOrder) {
            log(`[S-BUYING] ⏳ Buy order ${slastOrder.order_id} pending confirmation...`, 'debug');
            return;
        }

        // 2. INVERSE TRAILING STOP LOGIC
        const configPercent = config.short?.trailing_percent || TRAILING_STOP_PERCENTAGE;
        const trailingStopPercent = configPercent / 100;

        let currentMin = (pm > 0) ? pm : currentPrice;
        const newPm = Math.min(currentMin, currentPrice);
        const newPc = newPm * (1 + trailingStopPercent);

        // Update if a new lower floor is established
        if (newPm < pm || pm === 0) {
            log(`📉 [S-TRAILING] New Floor: ${newPm.toFixed(2)} | Buyback Stop: ${newPc.toFixed(2)} (+${configPercent}%)`, 'info');

            await updateGeneralBotState({ 
                spm: newPm, 
                spc: newPc
            });
        }

        // 3. TRIGGER CONDITION
        if (acBuying >= MIN_CLOSE_AMOUNT_BTC) {
            
            const triggerPrice = pc > 0 ? pc : newPc;

            // If price bounces back upward and hits the trigger stop
            if (currentPrice >= triggerPrice) {
                log(`💰 [S-CLOSE] Rebound detected: ${currentPrice.toFixed(2)} >= ${triggerPrice.toFixed(2)}. Executing buyback...`, 'success');
                
                try {
                    await placeShortBuyOrder(config, botState, acBuying, log, updateGeneralBotState, currentPrice, placeShortOrder); 
                } catch (error) {
                    // Safety protection: Any unexpected exchange rejection forces a safety pause
                    log(`❌ Critical error in Short buyback execution on Exchange: ${error.message}. Pausing bot for safety.`, 'error');
                    await updateBotState('PAUSED', SSTATE); 
                }
            } else {
                // Tracking heartbeat metrics
                const distToClose = ((triggerPrice / currentPrice - 1) * 100).toFixed(2);
                log(`[S-BUYING] 👁️ BTC: ${currentPrice.toFixed(2)} | Floor: ${newPm.toFixed(2)} | Buyback at: ${triggerPrice.toFixed(2)} (+${distToClose}%)`, 'info');
            }
        } else {
            // 4. EXPLICIT RESIDUE MANAGEMENT (DUST)
            if (acBuying <= 0 && !botState.slastOrder) {
                log(`[S-BUYING] Returning to SELLING. Cycle concluded with no remaining assets (sac).`, 'info');
                await updateBotState('SELLING', SSTATE);
            } else if (acBuying > 0) {
                // If residual dust floats below exchange limits, pause for manual intervention rather than looping
                log(`🚨 [S-BUYING] Inventory mismatch: Remaining asset amount (sac: ${acBuying}) is below BitMart minimum (${MIN_CLOSE_AMOUNT_BTC}). Pausing bot.`, 'error');
                await updateBotState('PAUSED', SSTATE);
            }
        }
    } catch (criticalError) {
        log(`🔥 [CRITICAL] Unexpected error in SBuying: ${criticalError.message}`, 'error');
        try {
            await updateBotState('PAUSED', SSTATE);
        } catch (dbError) {
            log(`🚨 [CRITICAL] Unable to update database to PAUSED: ${dbError.message}`, 'error');
        }
    }
}

module.exports = { run };