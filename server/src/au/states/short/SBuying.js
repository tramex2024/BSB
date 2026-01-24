// BSB/server/src/au/states/short/SBuying.js

const { placeShortBuyOrder } = require('../../managers/shortOrderManager');

const MIN_CLOSE_AMOUNT_BTC = 0.00001; 
const SSTATE = 'short';
const TRAILING_STOP_PERCENTAGE = 0.3; // 0.3% de rebote por defecto

async function run(dependencies) {
    const { 
        botState, currentPrice, config, log, 
        updateSStateData, updateBotState, updateGeneralBotState,
        logSuccessfulCycle 
    } = dependencies;
    
    if (!currentPrice || currentPrice <= 0) return;

    const slastOrder = botState.slastOrder;  
    const acBuying = parseFloat(botState.sac || 0); // Short Accumulated Coins
    const pm = parseFloat(botState.spm || 0);       // Suelo (mínimo alcanzado)
    const pc = parseFloat(botState.spc || 0);       // Stop Recompra (Precio de corte)

    // 1. BLOQUEO DE SEGURIDAD
    if (slastOrder) {
        log(`[S-BUYING] ⏳ Orden activa detectada. Esperando consolidación...`, 'debug');
        return;
    }

    // 2. LÓGICA DE TRAILING STOP INVERSO
    // Buscamos trailing_percent en el JSON, si no, usamos el 0.3%
    const configPercent = config.short?.trailing_percent || TRAILING_STOP_PERCENTAGE;
    const trailingStopPercent = configPercent / 100;

    // Inicialización del suelo (pm)
    let currentMin = (pm > 0) ? pm : currentPrice;
    
    // Si el precio actual es el nuevo mínimo, lo capturamos
    const newPm = Math.min(currentMin, currentPrice);
    
    // El precio de cierre es el suelo + el margen de rebote
    const newPc = newPm * (1 + trailingStopPercent);

    // Si encontramos un nuevo suelo, o es la primera vez (pm === 0)
    if (newPm < pm || pm === 0) {
        log(`📉 [S-TRAILING] Nuevo Suelo: ${newPm.toFixed(2)}. Recompra (PC) ajustada a: ${newPc.toFixed(2)} (+${configPercent}%)`, 'info');

        await updateGeneralBotState({ 
            spm: newPm, 
            spc: newPc,
            sbprice: newPc // Para visualización en el front
        });
    }

    // 3. CONDICIÓN DE DISPARO
    if (acBuying >= MIN_CLOSE_AMOUNT_BTC) {
        
        const triggerPrice = pc > 0 ? pc : newPc;

        if (currentPrice >= triggerPrice) {
            log(`💰 [S-CLOSE] Rebote confirmado: ${currentPrice.toFixed(2)} >= ${triggerPrice.toFixed(2)}. Cerrando Short...`, 'success');
            
            try {
                await placeShortBuyOrder(config, botState, acBuying, log, updateSStateData, currentPrice, {
                    logSuccessfulCycle,
                    updateBotState,
                    updateGeneralBotState
                }); 
            } catch (error) {
                log(`❌ Error crítico en recompra Short: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough')) {
                    log('⚠️ Saldo USDT insuficiente para cerrar el Short.', 'error');
                    await updateBotState('PAUSED', SSTATE); 
                }
            }
        } else {
            const distAlCierre = (((triggerPrice / currentPrice) - 1) * 100).toFixed(2);
            log(`[S-BUYING] 👁️ BTC: ${currentPrice.toFixed(2)} | Suelo: ${newPm.toFixed(2)} | Stop Recompra: ${triggerPrice.toFixed(2)} (Falta: ${distAlCierre}%)`, 'info');
        }
    } else {
        log(`[S-BUYING] ⚠️ No hay monedas (sac) para cerrar.`, 'warning');
        if (acBuying <= 0 && !slastOrder) await updateBotState('SELLING', SSTATE);
    }
}

module.exports = { run };