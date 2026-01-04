// BSB/server/src/au/states/short/SBuying.js

const { placeShortBuyOrder } = require('../../managers/shortOrderManager');

const MIN_CLOSE_AMOUNT_BTC = 0.00005;
const SSTATE = 'short';
const TRAILING_STOP_PERCENTAGE = 0.4; // Rebote del 0.4% desde el mínimo para cerrar

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

    // 2. LÓGICA DE TRAILING STOP INVERSO (Hacia abajo)
    const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100;

    // En Short, PM es el precio MÍNIMO alcanzado. 
    // Si no existe (primera vuelta), usamos el precio actual.
    const currentMin = pm || currentPrice;
    const newPm = Math.min(currentMin, currentPrice);
    
    // El PC (Precio de Cierre) se sitúa un 0.4% POR ENCIMA del suelo detectado
    const newPc = newPm * (1 + trailingStopPercent);

    // Si el precio marca un nuevo mínimo, "bajamos" la orden de cierre
    if (newPm < currentMin || !pm) {
        log(`📉 [S-TRAILING] Nuevo mínimo detectado: ${newPm.toFixed(2)}. Recompra bajó a: ${newPc.toFixed(2)}`, 'info');

        await updateSStateData({ pm: newPm, pc: newPc });
        await updateGeneralBotState({ ssprice: newPc }); // Actualiza la línea visual en el dashboard
    }

    // 3. CONDICIÓN DE DISPARO (REBOTE)
    if (acBuying >= MIN_CLOSE_AMOUNT_BTC) {
        
        // Si el precio rebota y cruza hacia ARRIBA el PC, cerramos con profit
        if (currentPrice >= (pc || newPc)) {
            log(`💰 [S-CLOSE] ¡Profit detectado por rebote! Precio ${currentPrice.toFixed(2)} >= Stop ${pc?.toFixed(2)}. Recomprando ${acBuying.toFixed(8)} BTC.`, 'success');
            
            try {
                // placeShortBuyOrder realiza el bloqueo atómico inyectando la orden en lastOrder
                await placeShortBuyOrder(config, botState, acBuying, log, updateSStateData); 
            } catch (error) {
                log(`❌ [S] Error crítico al recomprar: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough') || error.message.includes('volume too small')) {
                    log('⚠️ Error de balance/volumen en cierre Short. Pasando a NO_COVERAGE.', 'error');
                    await updateBotState('NO_COVERAGE', SSTATE); 
                }
            }
        } else {
            // Log de monitoreo silencioso para no saturar Render
            log(`[S-BUYING] Buscando suelo... Precio: ${currentPrice.toFixed(2)} | Recompra en: ${pc?.toFixed(2)}`, 'debug');
        }
    } else {
        log(`[S-BUYING] ⚠️ Deuda BTC insuficiente para cerrar (${acBuying.toFixed(8)} BTC).`, 'warning');
    }
}

module.exports = { run };