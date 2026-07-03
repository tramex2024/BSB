// BSB/server/src/states/long/LSelling.js

const { placeLongSellOrder } = require('../../managers/longOrderManager');

const MIN_SELL_AMOUNT_BTC = 0.00005; // BitMart BTC minimum
const LSTATE = 'long';

/**
 * SELLING STATE (LONG):
 * Manages Trailing Stop Loss and executes the final sale of the cycle.
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
        placeLongOrder 
    } = dependencies;
    
    // Global wrapper to safeguard the execution thread
    try {
        const lastOrder = botState.llastOrder; 
        const acSelling = parseFloat(botState.lac || 0); 
        const pm = parseFloat(botState.lpm || 0);        
        const pc = parseFloat(botState.lpc || 0);        

        // 1. Safety Lock: Avoid double execution
        if (lastOrder) {
            log(`[L-SELLING] ⏳ Sell order ${lastOrder.order_id} pending confirmation...`, 'debug');
            return;
        }

        // 2. TRAILING STOP LOGIC
        const trailingStopPercent = (parseFloat(config.long?.trailing_percent || 0.3)) / 100;

        let newPm = pm;
        if (pm === 0 || currentPrice > pm) {
            newPm = currentPrice;
        }
        
        const newPc = newPm * (1 - trailingStopPercent);

        // If price goes up, we update the Stop Loss in DB
        if (newPm > pm) {
            log(`📈 [L-TRAILING] Price rise detected: ${newPm.toFixed(2)} | New Stop: ${newPc.toFixed(2)}`, 'info');

            await updateGeneralBotState({ 
                lpm: newPm, 
                lpc: newPc
            });
        }

        // 3. TRIGGER CONDITION
        if (acSelling >= MIN_SELL_AMOUNT_BTC) {
            
            const currentStop = pc > 0 ? pc : newPc;
            
            // If price hits the Stop Loss, sell everything
            if (currentPrice <= currentStop) {
                log(`💰 [L-SELL] TRIGGER ACTIVATED | Liquidating signed position...`, 'success');
                
                try {
                    await placeLongSellOrder(config, botState, acSelling, log, updateGeneralBotState, placeLongOrder); 
                } catch (error) {
                    // Any error during critical liquidation forces a safety pause
                    log(`❌ Critical error in sell execution on Exchange: ${error.message}. Pausing bot to prevent API loops.`, 'error');
                    await updateBotState('PAUSED', LSTATE); 
                }
            } else {
                // Monitoring log (The Eye 👁️)
                const entryPrice = parseFloat(botState.lppc || 0);
                const profitActual = entryPrice > 0 ? (((currentPrice / entryPrice) - 1) * 100).toFixed(2) : "0.00";
                const distToStop = Math.abs(((currentPrice / currentStop) - 1) * 100).toFixed(2);
                const signStop = currentStop > currentPrice ? '+' : '-';

                log(`[L-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | Profit: +${profitActual}% | Stop: ${currentStop.toFixed(2)} (${signStop}${distToStop}%)`, 'info');
            }
        } else {
            // 4. DUST AND INVENTORY RESIDUE MANAGEMENT
            if (acSelling <= 0) {
                log(`[L-SELLING] Returning to BUYING. No assets remaining in this cycle's inventory.`, 'info');
                await updateBotState('BUYING', LSTATE);
            } else {
                // If there's asset residue left but it's below exchange minimum limits, pause to allow manual adjustments
                log(`🚨 [L-SELLING] Inventory mismatch: Remaining asset amount (${acSelling}) is below Exchange minimum (${MIN_SELL_AMOUNT_BTC}). Pausing for safety.`, 'error');
                await updateBotState('PAUSED', LSTATE);
            }
        }
    } catch (criticalError) {
        log(`🔥 [CRITICAL] Unexpected crash in LSelling: ${criticalError.message}`, 'error');
        try {
            await updateBotState('PAUSED', LSTATE);
        } catch (dbError) {
            log(`🚨 [CRITICAL] Database unreachable during emergency pause: ${dbError.message}`, 'error');
        }
    }
}

module.exports = { run };