//BSB/server/src/au/states/short/SBuying.js

const { placeShortBuyOrder } = require('../../managers/shortOrderManager');

const MIN_CLOSE_AMOUNT_BTC = 0.00001; 
const SSTATE = 'short';
const TRAILING_STOP_PERCENTAGE = 0.3; // Default 0.3% bounce

async function run(dependencies) {
    const { 
        userId, // <--- IDENTIDAD INYECTADA
        botState, currentPrice, config, log, 
        updateSStateData, updateBotState, updateGeneralBotState,
        logSuccessfulCycle 
    } = dependencies;
    
    if (!currentPrice || currentPrice <= 0) return;

    const slastOrder = botState.slastOrder;  
    const acBuying = parseFloat(botState.sac || 0); // Short Accumulated Coins
    const pm = parseFloat(botState.spm || 0);       // Floor (mínimo alcanzado)
    const pc = parseFloat(botState.spc || 0);       // Buyback Stop (Precio de corte)

    // 1. SECURITY LOCK
    if (slastOrder) {
        log(`[S-BUYING] ⏳ Active order detected. Waiting for consolidation...`, 'debug');
        return;
    }

    // 2. INVERSE TRAILING STOP LOGIC
    const configPercent = config.short?.trailing_percent || TRAILING_STOP_PERCENTAGE;
    const trailingStopPercent = configPercent / 100;

    // Inicialización del suelo (pm)
    let currentMin = (pm > 0) ? pm : currentPrice;
    
    // Si el precio actual es el nuevo mínimo, lo capturamos
    const newPm = Math.min(currentMin, currentPrice);
    
    // El precio de recompra es el suelo + el margen de rebote
    const newPc = newPm * (1 + trailingStopPercent);

    // Si encontramos un nuevo suelo, o es la primera vez
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

        // TRIGGER: Si el precio sube y toca el Stop de recompra
        if (currentPrice >= triggerPrice) {
            log(`💰 [S-CLOSE] Bounce confirmed: ${currentPrice.toFixed(2)} >= ${triggerPrice.toFixed(2)}. Closing Short...`, 'success');
            
            try {
                // PASAMOS EL userId PARA QUE EL MANAGER PERSISTA CORRECTAMENTE
                await placeShortBuyOrder(config, botState, acBuying, log, updateSStateData, currentPrice, {
                    logSuccessfulCycle,
                    updateBotState,
                    updateGeneralBotState,
                    userId // <--- IMPORTANTE: Inyectamos el dueño de la orden
                }); 
            } catch (error) {
                log(`❌ Critical error in Short buyback: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough')) {
                    log('⚠️ Insufficient USDT balance to close Short.', 'error');
                    await updateBotState('PAUSED', SSTATE); 
                }
            }
        } else {
            // Heartbeat monitoring (Solo visible para el usuario dueño)
            const distToClose = Math.abs(((triggerPrice / currentPrice) - 1) * 100).toFixed(2);
            const signStop = triggerPrice > currentPrice ? '+' : '-';

            log(`[S-BUYING] 👁️ BTC: ${currentPrice.toFixed(2)} | Floor: ${newPm.toFixed(2)} | Stop: ${triggerPrice.toFixed(2)} (${signStop}${distToClose}%)`, 'info');
        }
    } else {
        log(`[S-BUYING] ⚠️ No coins (sac) available to close.`, 'warning');
        if (acBuying <= 0 && !slastOrder) await updateBotState('SELLING', SSTATE);
    }
}

module.exports = { run };