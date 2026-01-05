// BSB/server/src/au/states/short/SBuying.js

const { placeShortBuyOrder } = require('../../managers/shortOrderManager');

const MIN_CLOSE_AMOUNT_BTC = 0.00005;
const SSTATE = 'short';
const TRAILING_STOP_PERCENTAGE = 0.4; 

async function run(dependencies) {
    const { 
        botState, currentPrice, config, log, 
        updateSStateData, updateBotState, updateGeneralBotState 
    } = dependencies;
    
    const lastOrder = botState.sStateData.lastOrder; 
    const { ac: acBuying, pm, pc } = botState.sStateData;

    // 1. BLOQUEO DE SEGURIDAD
    if (lastOrder) {
        log(`[S-BUYING] ⏳ Esperando confirmación de recompra Short (ID: ${lastOrder.order_id})...`, 'debug');
        return;
    }

    // 2. LÓGICA DE TRAILING STOP INVERSO
    const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100;

    // 🟢 MEJORA: Si es la primera vez que entra en este estado, inicializamos PM con el precio actual
    // para evitar que un valor 0 previo dispare un PC incorrecto.
    let currentMin = (pm && pm > 0) ? pm : currentPrice;
    const newPm = Math.min(currentMin, currentPrice);
    const newPc = newPm * (1 + trailingStopPercent);

    if (newPm < currentMin || !pm) {
        log(`📉 [S-TRAILING] Nuevo mínimo detectado: ${newPm.toFixed(2)}. Recompra sube a: ${newPc.toFixed(2)}`, 'info');

        await updateSStateData({ pm: newPm, pc: newPc });
        await updateGeneralBotState({ sbprice: newPc }); // 💡 Usar 'sbprice' para Short Buy Price
    }

    // 3. CONDICIÓN DE DISPARO (REBOTE)
    if (acBuying >= MIN_CLOSE_AMOUNT_BTC) {
        
        // Usamos el PC guardado en la DB o el nuevo calculado si es la primera vuelta
        const triggerPrice = pc || newPc;

        if (currentPrice >= triggerPrice) {
            log(`💰 [S-CLOSE] ¡Profit detectado por rebote! Precio ${currentPrice.toFixed(2)} >= Stop ${triggerPrice.toFixed(2)}. Recomprando ${acBuying.toFixed(8)} BTC.`, 'success');
            
            try {
                // Sigue usando la función correcta: placeShortBuyOrder
                await placeShortBuyOrder(config, botState, acBuying, log, updateSStateData); 
            } catch (error) {
                log(`❌ [S] Error crítico al recomprar: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough') || error.message.includes('volume too small')) {
                    log('⚠️ Error de balance/volumen en cierre Short. Pasando a NO_COVERAGE.', 'error');
                    await updateBotState('NO_COVERAGE', SSTATE); 
                }
            }
        } else {
            log(`[S-BUYING] Buscando suelo... Precio: ${currentPrice.toFixed(2)} | Recompra en: ${triggerPrice.toFixed(2)}`, 'debug');
        }
    } else {
        log(`[S-BUYING] ⚠️ Deuda BTC insuficiente para cerrar (${acBuying.toFixed(8)} BTC).`, 'warning');
    }
}

module.exports = { run };