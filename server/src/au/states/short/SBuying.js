const { placeShortBuyOrder } = require('../../managers/shortOrderManager');

const MIN_CLOSE_AMOUNT_BTC = 0.00001; 
const SSTATE = 'short';
const TRAILING_STOP_PERCENTAGE = 0.3; // Default 0.3% bounce

async function run(dependencies) {
    const { 
        botState, currentPrice, config, log, 
        updateSStateData, updateBotState, updateGeneralBotState,
        logSuccessfulCycle 
    } = dependencies;
    
    if (!currentPrice || currentPrice <= 0) return;

    const slastOrder = botState.slastOrder;  
    const acBuying = parseFloat(botState.sac || 0); // Short Accumulated Coins
    const pm = parseFloat(botState.spm || 0);       // Floor (min price reached)
    const pc = parseFloat(botState.spc || 0);       // Buyback Stop (Cut price)

    // 1. SECURITY LOCK
    if (slastOrder) {
        log(`[S-BUYING] ⏳ Active order detected. Waiting for consolidation...`, 'debug');
        return;
    }

    // 2. INVERSE TRAILING STOP LOGIC
    const configPercent = config.short?.trailing_percent || TRAILING_STOP_PERCENTAGE;
    const trailingStopPercent = configPercent / 100;

    // Floor initialization (pm)
    let currentMin = (pm > 0) ? pm : currentPrice;
    
    // If current price is the new minimum, we capture it
    const newPm = Math.min(currentMin, currentPrice);
    
    // The Buyback price is the floor + bounce margin
    const newPc = newPm * (1 + trailingStopPercent);

    // If we find a new floor, or it's the first time (pm === 0)
    if (newPm < pm || pm === 0) {
        log(`📉 [S-TRAILING] New Floor: ${newPm.toFixed(2)} | Buyback Stop (PC) set at: ${newPc.toFixed(2)} (+${configPercent}%)`, 'info');

        await updateGeneralBotState({ 
            spm: newPm, 
            spc: newPc
        });
    }

    // 3. TRIGGER CONDITION
    if (acBuying >= MIN_CLOSE_AMOUNT_BTC) {
        
        const triggerPrice = pc > 0 ? pc : newPc;

        // TRIGGER: If price rises and hits the Buyback Stop
        if (currentPrice >= triggerPrice) {
            log(`💰 [S-CLOSE] Bounce confirmed: ${currentPrice.toFixed(2)} >= ${triggerPrice.toFixed(2)}. Closing Short...`, 'success');
            
            try {
                await placeShortBuyOrder(config, botState, acBuying, log, updateSStateData, currentPrice, {
                    logSuccessfulCycle,
                    updateBotState,
                    updateGeneralBotState
                }); 
            } catch (error) {
                log(`❌ Critical error in Short buyback: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough')) {
                    log('⚠️ Insufficient USDT balance to close Short.', 'error');
                    await updateBotState('PAUSED', SSTATE); 
                }
            }
        } else {
            // Heartbeat monitoring (Unified Format)
            const distToClose = Math.abs(((triggerPrice / currentPrice) - 1) * 100).toFixed(2);
            
            // In Short Trailing, the Stop is above, hence '+'
            const signStop = triggerPrice > currentPrice ? '+' : '-';

            log(`[S-BUYING] 👁️ BTC: ${currentPrice.toFixed(2)} | Floor: ${newPm.toFixed(2)} | Stop: ${triggerPrice.toFixed(2)} (${signStop}${distToClose}%)`, 'info');
        }
    } else {
        log(`[S-BUYING] ⚠️ No coins (sac) available to close.`, 'warning');
        if (acBuying <= 0 && !slastOrder) await updateBotState('SELLING', SSTATE);
    }
}

module.exports = { run };