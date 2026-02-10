// BSB/server/src/au/states/long/LSelling.js

const { placeLongSellOrder } = require('../../managers/longOrderManager');

const MIN_SELL_AMOUNT_BTC = 0.00005; // Mínimo de BitMart para BTC
const LSTATE = 'long';

/**
 * SELLING STATE (LONG):
 * Gestiona el Trailing Stop Loss y ejecuta la venta final del ciclo.
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
        // --- INYECCIÓN DE LA FUNCIÓN FIRMADA ---
        placeLongOrder 
    } = dependencies;
    
    const lastOrder = botState.llastOrder; 
    const acSelling = parseFloat(botState.lac || 0); 
    const pm = parseFloat(botState.lpm || 0);        
    const pc = parseFloat(botState.lpc || 0);        

    // 1. Bloqueo de seguridad: Evitar duplicidad
    if (lastOrder) {
        log(`[L-SELLING] ⏳ Orden de venta ${lastOrder.order_id} pendiente de confirmación...`, 'debug');
        return;
    }

    // 2. LÓGICA DE TRAILING STOP
    const trailingStopPercent = (config.long?.trailing_percent || 0.3) / 100;

    let newPm = pm;
    if (pm === 0 || currentPrice > pm) {
        newPm = currentPrice;
    }
    
    const newPc = newPm * (1 - trailingStopPercent);

    // Si el precio sube, actualizamos el Stop Loss en la DB
    if (newPm > pm) {
        log(`📈 [L-TRAILING] Subida detectada: ${newPm.toFixed(2)} | Nuevo Stop: ${newPc.toFixed(2)}`, 'info');

        await updateGeneralBotState({ 
            lpm: newPm, 
            lpc: newPc
        });
    }

    // 3. CONDICIÓN DE DISPARO (Trigger)
    if (acSelling >= MIN_SELL_AMOUNT_BTC) {
        
        const currentStop = pc > 0 ? pc : newPc;
        
        // Si el precio toca el Stop Loss, vendemos todo
        if (currentPrice <= currentStop) {
            log(`💰 [L-SELL] TRIGGER ACTIVADO | Liquidando posición firmada...`, 'success');
            
            try {
                // --- CAMBIO: Pasamos placeLongOrder para que la venta lleve el prefijo L_ ---
                await placeLongSellOrder(config, botState, acSelling, log, updateGeneralBotState, placeLongOrder); 
            } catch (error) {
                log(`❌ Error crítico en ejecución de venta: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough') || error.message.includes('volume too small')) {
                    log('⚠️ Desfase de inventario detectado. Estado: PAUSED.', 'error');
                    await updateBotState('PAUSED', LSTATE); 
                }
            }
        } else {
            // Log de seguimiento (Dashboard)
            const profitActual = botState.lppc > 0 ? (((currentPrice / botState.lppc) - 1) * 100).toFixed(2) : "0.00";
            const distToStop = Math.abs(((currentPrice / currentStop) - 1) * 100).toFixed(2);
            const signStop = currentStop > currentPrice ? '+' : '-';

            log(`[L-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | Profit: +${profitActual}% | Stop: ${currentStop.toFixed(2)} (${signStop}${distToStop}%)`, 'info');
        }
    } else {
        log(`[L-SELLING] ⚠️ Cantidad insuficiente (lac: ${acSelling}) para vender. Reajustando...`, 'warning');
        if (acSelling <= 0) await updateBotState('BUYING', LSTATE);
    }
}

module.exports = { run };