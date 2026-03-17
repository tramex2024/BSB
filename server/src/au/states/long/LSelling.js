// BSB/server/src/au/states/long/LSelling.js

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
        // --- SIGNED FUNCTION INJECTION ---
        placeLongOrder 
    } = dependencies;
    
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
                // --- SIGNED EXECUTION: Using the injected placeLongOrder with L_ prefix ---
                await placeLongSellOrder(config, botState, acSelling, log, updateGeneralBotState, placeLongOrder); 
            } catch (error) {
                log(`❌ Critical error in sell execution: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough') || error.message.includes('volume too small')) {
                    log('⚠️ Inventory mismatch detected. State set to PAUSED.', 'error');
                    await updateBotState('PAUSED', LSTATE); 
                }
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
        log(`[L-SELLING] ⚠️ Insufficient amount (lac: ${acSelling}) to sell. Readjusting...`, 'warning');
        // If there's literally nothing to sell, we go back to BUYING or STOPPED
        if (acSelling <= 0) await updateBotState('BUYING', LSTATE);
    }
}

module.exports = { run };