// BSB/server/src/au/states/short/SBuying.js

const { placeShortBuyOrder } = require('../../managers/shortOrderManager');

const MIN_CLOSE_AMOUNT_BTC = 0.00001; 
const SSTATE = 'short';
const TRAILING_STOP_PERCENTAGE = 0.4; 

async function run(dependencies) {
    const { 
        botState, currentPrice, config, log, 
        updateSStateData, updateBotState, updateGeneralBotState,
        logSuccessfulCycle // AÑADIDO: Para persistencia del ciclo
    } = dependencies;
    
    // 0. VALIDACIÓN INICIAL DE PRECIO (Seguridad para el Trailing)
    if (!currentPrice || currentPrice <= 0) return;

    const lastOrder = botState.sStateData.lastOrder; 
    const acBuying = parseFloat(botState.sStateData.ac || 0);
    const pm = parseFloat(botState.sStateData.pm || 0);
    const pc = parseFloat(botState.sStateData.pc || 0);

    // 1. BLOQUEO DE SEGURIDAD
    if (lastOrder) {
        log(`[S-BUYING] ⏳ Orden activa (ID: ${lastOrder.order_id}). Esperando confirmación...`, 'debug');
        return;
    }

    // 2. LÓGICA DE TRAILING STOP INVERSO
    const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100;

    // Inicializamos o actualizamos el Precio Mínimo (Suelo)
    let currentMin = (pm > 0) ? pm : currentPrice;
    const newPm = Math.min(currentMin, currentPrice);
    
    // Calculamos el Precio de Cierre (PC) basado en el rebote desde el mínimo
    const newPc = newPm * (1 + trailingStopPercent);

    // Si el precio baja, actualizamos el Stop de recompra
    if (newPm < currentMin || !pm) {
        log(`📉 [S-TRAILING] Suelo: ${newPm.toFixed(2)} | Stop Recompra baja a: ${newPc.toFixed(2)}`, 'info');

        await updateSStateData({ pm: newPm, pc: newPc });
        await updateGeneralBotState({ sbprice: newPc }); 
    }

    // 3. CONDICIÓN DE DISPARO (REBOTE)
    if (acBuying >= MIN_CLOSE_AMOUNT_BTC) {
        
        const triggerPrice = pc > 0 ? pc : newPc;

        if (currentPrice >= triggerPrice) {
            log(`💰 [S-CLOSE] ¡Rebote detectado! Precio ${currentPrice.toFixed(2)} >= Stop ${triggerPrice.toFixed(2)}. Recomprando deuda de ${acBuying.toFixed(8)} BTC.`, 'success');
            
            try {
                // MODIFICACIÓN: Pasamos las dependencias para que el ciclo se guarde al confirmarse la orden
                await placeShortBuyOrder(config, botState, acBuying, log, updateSStateData, currentPrice, {
                    logSuccessfulCycle,
                    updateBotState,
                    updateGeneralBotState
                }); 
            } catch (error) {
                log(`❌ [S] Error en ejecución de recompra: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough') || error.message.includes('volume too small')) {
                    log('⚠️ Error crítico de balance en cierre. Revisar disponible USDT.', 'error');
                    await updateBotState('NO_COVERAGE', SSTATE); 
                }
            }
        } else {
            log(`[S-BUYING] Monitoreando... Suelo: ${newPm.toFixed(2)} | Esperando rebote a: ${triggerPrice.toFixed(2)}`, 'debug');
        }
    } else {
        log(`[S-BUYING] ⚠️ No hay deuda BTC suficiente para cerrar (${acBuying.toFixed(8)} BTC).`, 'warning');
    }
}

module.exports = { run };