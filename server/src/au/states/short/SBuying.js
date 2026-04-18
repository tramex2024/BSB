/**
 * BSB/server/src/au/states/short/SBuying.js
 * Gestión de Trailing Stop Inverso y Monitoreo de Recompra
 */

const { placeShortBuyOrder } = require('../../managers/shortOrderManager');
// 1. IMPORTACIÓN DEL MONITOR (Para desbloquear slastOrder)
const { monitorAndConsolidateShortBuy: monitorShortBuy } = require('./ShortBuyConsolidator');

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
        botState, 
        currentPrice, 
        config, 
        log, 
        updateBotState, 
        updateGeneralBotState,
        updateSStateData, // <--- Inyectado para actualizar balances al consolidar
        placeShortOrder,
        userCreds // <--- Inyectado para BitMart
    } = dependencies;
    
    if (!currentPrice || currentPrice <= 0) return;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const slastOrder = botState.slastOrder;  
    const acBuying = parseFloat(botState.sac || 0); 
    const pm = parseFloat(botState.spm || 0);       // Suelo (mínimo)
    const pc = parseFloat(botState.spc || 0);       // Stop de recompra (precio gatillo)

    // 1. BLOQUEO DE SEGURIDAD CON MONITOREO ACTIVO
    // Si hay una orden, el monitor intentará cerrarla. Si sigue activa, retorna true y pausamos.
    if (slastOrder) {
        const orderIsActive = await monitorShortBuy(
            botState, 
            SYMBOL, 
            log, 
            updateSStateData, 
            updateBotState, 
            updateGeneralBotState, 
            userId,
            userCreds // <--- Pasamos las credenciales inyectadas
        );

        if (orderIsActive) {
            log(`[S-BUYING] ⏳ Orden activa detectada. Esperando consolidación...`, 'debug');
            return;
        }
    }

    // 2. LÓGICA DE TRAILING STOP INVERSO
    const configPercent = config.short?.trailing_percent || TRAILING_STOP_PERCENTAGE;
    const trailingStopPercent = configPercent / 100;

    let currentMin = (pm > 0) ? pm : currentPrice;
    const newPm = Math.min(currentMin, currentPrice);
    const newPc = newPm * (1 + trailingStopPercent);

    // Actualizamos si hay un nuevo suelo
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

        // Si el precio sube y toca el stop (rebote)
        if (currentPrice >= triggerPrice) {
            log(`💰 [S-CLOSE] Rebote detectado: ${currentPrice.toFixed(2)} >= ${triggerPrice.toFixed(2)}. Ejecutando recompra...`, 'success');
            
            try {
                // El manager utiliza la función firmada por usuario para cerrar el ciclo.
                await placeShortBuyOrder(config, botState, acBuying, log, updateGeneralBotState, currentPrice, placeShortOrder); 
            } catch (error) {
                log(`❌ Error crítico en recompra Short: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough')) {
                    log('⚠️ Saldo USDT insuficiente para cerrar el Short.', 'error');
                    await updateBotState('PAUSED', SSTATE); 
                }
            }
        } else {
            // Heartbeat de seguimiento
            const distToClose = ((triggerPrice / currentPrice - 1) * 100).toFixed(2);
            log(`[S-BUYING] 👁️ BTC: ${currentPrice.toFixed(2)} | Suelo: ${newPm.toFixed(2)} | Recompra en: ${triggerPrice.toFixed(2)} (+${distToClose}%)`, 'info');
        }
    } else {
        log(`[S-BUYING] ⚠️ No hay sac para cerrar. Reajustando a SELLING...`, 'warning');
        if (acBuying <= 0 && !botState.slastOrder) await updateBotState('SELLING', SSTATE);
    }
}

module.exports = { run };