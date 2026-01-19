// BSB/server/src/au/states/long/LSelling.js

const { placeLongSellOrder } = require('../../managers/longOrderManager');

const MIN_SELL_AMOUNT_BTC = 0.00005;
const LSTATE = 'long';
const TRAILING_STOP_PERCENTAGE = 0.3; // 0.3% de retroceso para vender

async function run(dependencies) {
    const { 
        botState, currentPrice, config, log, 
        updateBotState, updateGeneralBotState 
    } = dependencies;
    
    // ✅ MIGRADO: Referencias directas a raíz
    const lastOrder = botState.llastOrder; 
    const acSelling = parseFloat(botState.lac || 0); // Monedas acumuladas
    const pm = parseFloat(botState.lpm || 0);        // Precio Máximo alcanzado
    const pc = parseFloat(botState.lpc || 0);        // Precio de Corte (Stop)

    // 1. BLOQUEO DE SEGURIDAD
    if (lastOrder) {
        log(`[L-SELLING] ⏳ Esperando consolidación de orden de venta ${lastOrder.order_id}...`, 'debug');
        return;
    }

    // 2. LÓGICA DE TRAILING STOP
    const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100;

    // Aseguramos que pm tenga un valor inicial válido basado en el precio actual
    const newPm = Math.max(pm, currentPrice);
    const newPc = newPm * (1 - trailingStopPercent);

    // Si el precio sube, arrastramos el Stop hacia arriba
    if (newPm > pm) {
        log(`📈 [L-TRAILING] Nuevo máximo: ${newPm.toFixed(2)}. Stop sube a: ${newPc.toFixed(2)}`, 'info');

        // ✅ ACTUALIZACIÓN EN RAÍZ: Guardamos el nuevo máximo y el nuevo stop
        await updateGeneralBotState({ 
            lpm: newPm, 
            lpc: newPc,
            lsprice: newPc // Sincronización visual para el Dashboard
        });
    }

    // 3. CONDICIÓN DE DISPARO
    // Verificamos que tengamos BTC acumulado (lac) suficiente
    if (acSelling >= MIN_SELL_AMOUNT_BTC) {
        
        // El disparo ocurre si el precio cae por debajo del Stop (lpc)
        const currentStop = pc || newPc;
        
        if (currentPrice <= currentStop) {
            log(`💰 [L-SELL] ¡Trailing Stop activado! Precio ${currentPrice.toFixed(2)} <= Stop ${currentStop.toFixed(2)}. Liquidando ${acSelling.toFixed(8)} BTC.`, 'success');
            
            try {
                // Llamamos al manager para colocar la orden de mercado
                await placeLongSellOrder(config, botState, acSelling, log, updateGeneralBotState); 
            } catch (error) {
                log(`❌ Error crítico al intentar vender: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough') || error.message.includes('volume too small')) {
                    log('⚠️ Transicionando a NO_COVERAGE para revisión manual de balance BTC.', 'error');
                    await updateBotState('NO_COVERAGE', LSTATE); 
                }
            }
        } else {
            // Log de seguimiento (Latido de venta)
            const distToStop = (((currentPrice / currentStop) - 1) * 100).toFixed(2);
            log(`[L-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | Máximo: ${newPm.toFixed(2)} | Stop Venta: ${currentStop.toFixed(2)} (-${distToStop}%) | AC: ${acSelling.toFixed(8)}`, 'info');
        }
    } else {
        log(`[L-SELLING] ⚠️ AC insuficiente para vender (${acSelling.toFixed(8)} BTC).`, 'warning');
    }
}

module.exports = { run };