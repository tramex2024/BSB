// BSB/server/src/au/states/short/SBuying.js

const { placeShortBuyOrder } = require('../../managers/shortOrderManager');

const MIN_CLOSE_AMOUNT_BTC = 0.00001; 
const SSTATE = 'short';
const TRAILING_STOP_PERCENTAGE = 0.3; // Por defecto 0.3%

/**
 * S-BUYING STATE (SHORT):
 * Gestiona el Trailing Stop inverso para maximizar la caída del Short.
 */
async function run(dependencies) {
    const { 
        userId, 
        botState, currentPrice, config, log, 
        updateBotState, updateGeneralBotState,
        availableUSDT, // 🟢 AUDITORÍA: Validamos contra USDT disponible para la recompra
        placeShortOrder 
    } = dependencies;
    
    if (!currentPrice || currentPrice <= 0) return;

    const slastOrder = botState.slastOrder;  
    const acBuying = parseFloat(botState.sac || 0); 
    const pm = parseFloat(botState.spm || 0);       // Suelo (mínimo)
    const pc = parseFloat(botState.spc || 0);       // Stop de recompra (precio gatillo)

    // 1. BLOQUEO DE SEGURIDAD
    if (slastOrder) {
        log(`[S-BUYING] ⏳ Orden activa detectada. Esperando consolidación...`, 'debug');
        return;
    }

    // 2. LÓGICA DE TRAILING STOP INVERSO
    const configPercent = config.short?.trailing_percent || TRAILING_STOP_PERCENTAGE;
    const trailingStopPercent = configPercent / 100;

    let currentMin = (pm > 0) ? pm : currentPrice;
    const newPm = Math.min(currentMin, currentPrice);
    const newPc = newPm * (1 + trailingStopPercent);

    if (newPm < pm || pm === 0) {
        log(`📉 [S-TRAILING] Nuevo Suelo: ${newPm.toFixed(2)} | Stop Recompra: ${newPc.toFixed(2)} (+${configPercent}%)`, 'info');

        await updateGeneralBotState({ 
            spm: newPm, 
            spc: newPc
        });
    }

    // 3. CONDICIÓN DE DISPARO (TRIGGER)
    if (acBuying >= MIN_CLOSE_AMOUNT_BTC) {
        
        const triggerPrice = pc > 0 ? pc : newPc;

        if (currentPrice >= triggerPrice) {
            // 🟢 AUDITORÍA: Validación preventiva de saldo USDT
            const costUsdt = acBuying * currentPrice;
            if (availableUSDT < costUsdt) {
                log(`⚠️ [S-BUYING] Saldo USDT insuficiente para recompra (${availableUSDT.toFixed(2)} / ${costUsdt.toFixed(2)}). Pausando.`, 'error');
                await updateBotState('PAUSED', SSTATE);
                return;
            }

            log(`💰 [S-CLOSE] Rebote detectado: ${currentPrice.toFixed(2)} >= ${triggerPrice.toFixed(2)}. Ejecutando recompra...`, 'success');
            
            try {
                await placeShortBuyOrder(config, botState, acBuying, log, updateGeneralBotState, currentPrice, placeShortOrder); 
            } catch (error) {
                log(`❌ Error crítico en recompra Short: ${error.message}`, 'error');
                if (error.message.includes('Balance not enough')) {
                    await updateBotState('PAUSED', SSTATE); 
                }
            }
        } else {
            const distToClose = ((triggerPrice / currentPrice - 1) * 100).toFixed(2);
            log(`[S-BUYING] 👁️ BTC: ${currentPrice.toFixed(2)} | Suelo: ${newPm.toFixed(2)} | Recompra en: ${triggerPrice.toFixed(2)} (+${distToClose}%)`, 'info');
        }
    } else {
        log(`[S-BUYING] ⚠️ No hay sac para cerrar. Reajustando a SELLING...`, 'warning');
        if (acBuying <= 0 && !slastOrder) await updateBotState('SELLING', SSTATE);
    }
}

module.exports = { run };