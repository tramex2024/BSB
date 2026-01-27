const { placeLongSellOrder } = require('../../managers/longOrderManager');

const MIN_SELL_AMOUNT_BTC = 0.00005; // BitMart Minimum
const LSTATE = 'long';

async function run(dependencies) {
    const { 
        botState, currentPrice, config, log, 
        updateBotState, updateGeneralBotState 
    } = dependencies;
    
    // ✅ MIGRATED: Direct Root References (Flat Architecture 2026)
    const lastOrder = botState.llastOrder; 
    const acSelling = parseFloat(botState.lac || 0); 
    const pm = parseFloat(botState.lpm || 0);        
    const pc = parseFloat(botState.lpc || 0);        

    // 1. SECURITY LOCK: Prevent duplicate orders
    if (lastOrder) {
        log(`[L-SELLING] ⏳ Order ${lastOrder.order_id} pending. Waiting for exchange confirmation...`, 'debug');
        return;
    }

    // 2. TRAILING STOP LOGIC
    const trailingStopPercent = (config.long?.trailing_percent || 0.3) / 100;

    // Initialization or update of the maximum price reached
    let newPm = pm;
    if (pm === 0 || currentPrice > pm) {
        newPm = currentPrice;
    }
    
    // Cut price (Stop) is the max minus the pullback percentage
    const newPc = newPm * (1 - trailingStopPercent);

    // If price rose and generated a new high, update root state
    if (newPm > pm) {
        log(`📈 [L-TRAILING] Price rise: ${newPm.toFixed(2)} | New Stop: ${newPc.toFixed(2)}`, 'info');

        await updateGeneralBotState({ 
            lpm: newPm, 
            lpc: newPc
        });
    }

    // 3. TRIGGER CONDITION
    if (acSelling >= MIN_SELL_AMOUNT_BTC) {
        
        const currentStop = pc > 0 ? pc : newPc;
        
        // TRIGGER: If price drops and hits the Stop
        if (currentPrice <= currentStop) {
            log(`💰 [L-SELL] TRIGGER ACTIVATED | Price: ${currentPrice.toFixed(2)} <= Stop: ${currentStop.toFixed(2)} | Selling All...`, 'success');
            
            try {
                await placeLongSellOrder(config, botState, acSelling, log, updateGeneralBotState); 
            } catch (error) {
                log(`❌ Critical error in sell execution: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough') || error.message.includes('volume too small')) {
                    log('⚠️ Inventory mismatch detected. State: PAUSED.', 'error');
                    await updateBotState('PAUSED', LSTATE); 
                }
            }
        } else {
            // Heartbeat monitoring log (Unified Format)
            const profitActual = (((currentPrice / botState.lppc) - 1) * 100).toFixed(2);
            const distToStop = Math.abs(((currentPrice / currentStop) - 1) * 100).toFixed(2);
            
            // In Selling Long, the Stop is always below, hence the '-'
            const signStop = currentStop > currentPrice ? '+' : '-';

            log(`[L-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | Profit: +${profitActual}% | Stop: ${currentStop.toFixed(2)} (${signStop}${distToStop}%)`, 'info');
        }
    } else {
        log(`[L-SELLING] ⚠️ Insufficient accumulated quantity (lac) to sell.`, 'warning');
        if (acSelling <= 0) await updateBotState('BUYING', LSTATE);
    }
}

module.exports = { run };