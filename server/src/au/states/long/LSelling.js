// BSB/server/src/au/states/long/LSelling.js

// 🟢 CORRECCIÓN: Cambiado placeSellOrder por placeLongSellOrder para coincidir con el Manager
const { placeLongSellOrder } = require('../../managers/longOrderManager');

const MIN_SELL_AMOUNT_BTC = 0.00005;
const LSTATE = 'long';
const TRAILING_STOP_PERCENTAGE = 0.4; // 0.4% de retroceso para vender

async function run(dependencies) {
    const { 
        botState, currentPrice, config, log, 
        updateLStateData, updateBotState, updateGeneralBotState 
    } = dependencies;
    
    // Acceso seguro a lStateData
    const lStateData = botState.lStateData || {};
    const lastOrder = lStateData.lastOrder; 
    const { ac: acSelling, pm, pc } = lStateData;

    // 1. BLOQUEO DE SEGURIDAD
    if (lastOrder) {
        log(`[L-SELLING] ⏳ Esperando consolidación de orden de venta ${lastOrder.order_id}...`, 'debug');
        return;
    }

    // 2. LÓGICA DE TRAILING STOP
    const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100;

    // Aseguramos que pm (Precio Máximo) tenga un valor inicial válido
    const newPm = Math.max(pm || 0, currentPrice);
    const newPc = newPm * (1 - trailingStopPercent);

    if (newPm > (pm || 0)) {
        log(`📈 [L-TRAILING] Nuevo máximo: ${newPm.toFixed(2)}. Stop sube a: ${newPc.toFixed(2)}`, 'info');

        // Actualizamos datos locales del estado Long
        await updateLStateData({ pm: newPm, pc: newPc });
        // Actualizamos el precio de stop visual en el dashboard general (lsprice)
        await updateGeneralBotState({ lsprice: newPc });
    }

    // 3. CONDICIÓN DE DISPARO
    // Verificamos que tengamos BTC acumulado (AC) suficiente
    if (acSelling >= MIN_SELL_AMOUNT_BTC) {
        
        // El disparo ocurre si el precio cae por debajo del Stop (pc)
        if (currentPrice <= (pc || newPc)) {
            log(`💰 [L-SELL] ¡Trailing Stop activado! Precio ${currentPrice.toFixed(2)} <= Stop ${(pc || newPc).toFixed(2)}. Liquidando ${acSelling.toFixed(8)} BTC.`, 'success');
            
            try {
                // Pasamos 'config' (que ya tiene la nueva estructura config.long.trigger, etc.)
                // aunque placeLongSellOrder use principalmente el símbolo y credenciales.
                await placeLongSellOrder(config, botState, acSelling, log, updateLStateData); 
            } catch (error) {
                log(`❌ Error crítico al intentar vender: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough') || error.message.includes('volume too small')) {
                    log('⚠️ Transicionando a NO_COVERAGE para revisión manual de balance BTC.', 'error');
                    await updateBotState('NO_COVERAGE', LSTATE); 
                }
            }
        } else {
            // Log de seguimiento mientras el precio sube o se mantiene
            const currentStop = pc || newPc;
            const distToStop = (((currentPrice / currentStop) - 1) * 100).toFixed(2);
            log(`[L-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | Máximo: ${newPm.toFixed(2)} | Stop Venta: ${currentStop.toFixed(2)} (-${distToStop}%) | AC: ${acSelling.toFixed(8)}`, 'info');
        }
    } else {
        log(`[L-SELLING] ⚠️ AC insuficiente para vender (${acSelling ? acSelling.toFixed(8) : 0} BTC).`, 'warning');
    }
}

module.exports = { run };