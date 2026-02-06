// BSB/server/src/au/states/short/SBuying.js

const { placeShortBuyOrder } = require('../../managers/shortOrderManager');

const MIN_CLOSE_AMOUNT_BTC = 0.00001; 
const SSTATE = 'short';
const TRAILING_STOP_PERCENTAGE = 0.4; 

async function run(dependencies) {
    const { 
        botState, currentPrice, config, log, 
        updateSStateData, updateBotState, updateGeneralBotState,
        logSuccessfulCycle 
    } = dependencies;
    
    // 0. VALIDACIÓN INICIAL DE PRECIO
    if (!currentPrice || currentPrice <= 0) return;

    // Acceso seguro a los datos de estado Short
    const sStateData = botState.sStateData || {};
    const lastOrder = sStateData.lastOrder; 
    const acBuying = parseFloat(sStateData.ac || 0);
    const pm = parseFloat(sStateData.pm || 0); // Precio Mínimo (Suelo)
    const pc = parseFloat(sStateData.pc || 0); // Precio de Cierre (Stop)

    // 1. BLOQUEO DE SEGURIDAD
    if (lastOrder) {
        log(`[S-BUYING] ⏳ Orden de recompra activa (ID: ${lastOrder.order_id}).`, 'debug');
        return;
    }

    // 2. LÓGICA DE TRAILING STOP INVERSO
    const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100;

    // Inicializamos o actualizamos el Suelo
    let currentMin = (pm > 0) ? pm : currentPrice;
    const newPm = Math.min(currentMin, currentPrice);
    
    // Calculamos el Precio de Cierre basado en el rebote
    const newPc = newPm * (1 + trailingStopPercent);

    // Si el precio baja, actualizamos el Stop de recompra para maximizar el profit
    if (newPm < currentMin || !pm) {
        log(`📉 [S-TRAILING] Suelo: ${newPm.toFixed(2)} | Stop Recompra baja a: ${newPc.toFixed(2)}`, 'info');

        await updateSStateData({ pm: newPm, pc: newPc });
        // Actualizamos sbprice en la raíz para el Dashboard
        await updateGeneralBotState({ sbprice: newPc }); 
    }

    // 3. CONDICIÓN DE DISPARO (REBOTE)
    if (acBuying >= MIN_CLOSE_AMOUNT_BTC) {
        
        const triggerPrice = pc > 0 ? pc : newPc;

        // Si el precio rebota y cruza el Stop (newPc), cerramos el ciclo
        if (currentPrice >= triggerPrice) {
            log(`💰 [S-CLOSE] ¡Rebote detectado! BTC ${currentPrice.toFixed(2)} >= Stop ${triggerPrice.toFixed(2)}. Recomprando deuda...`, 'success');
            
            try {
                // Inyectamos las dependencias necesarias para que el Manager cierre el ciclo
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
            // Log de monitoreo scannable
            log(`[S-BUYING] Monitoreando... Suelo: ${newPm.toFixed(2)} | Esperando rebote a: ${triggerPrice.toFixed(2)}`, 'debug');
        }
    } else {
        log(`[S-BUYING] ⚠️ No hay deuda BTC suficiente para cerrar (${acBuying.toFixed(8)} BTC).`, 'warning');
    }
}

module.exports = { run };