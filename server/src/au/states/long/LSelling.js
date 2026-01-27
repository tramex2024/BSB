// BSB/server/src/au/states/long/LSelling.js

const { placeLongSellOrder } = require('../../managers/longOrderManager');

const MIN_SELL_AMOUNT_BTC = 0.00005; // Mínimo de BitMart
const LSTATE = 'long';

async function run(dependencies) {
    const { 
        botState, currentPrice, config, log, 
        updateBotState, updateGeneralBotState 
    } = dependencies;
    
    // ✅ MIGRADO: Referencias directas a raíz (Estructura Plana 2026)
    const lastOrder = botState.llastOrder; 
    const acSelling = parseFloat(botState.lac || 0); 
    const pm = parseFloat(botState.lpm || 0);        
    const pc = parseFloat(botState.lpc || 0);        

    // 1. BLOQUEO DE SEGURIDAD: Evita duplicar órdenes si una ya está en proceso
    if (lastOrder) {
        log(`[L-SELLING] ⏳ Orden ${lastOrder.order_id} pendiente. Esperando confirmación del exchange...`, 'debug');
        return;
    }

    // 2. LÓGICA DE TRAILING STOP
    // Leemos el porcentaje de trailing de la config si existe, sino usamos 0.3% por defecto
    const trailingStopPercent = (config.long?.trailing_percent || 0.3) / 100;

    // Inicialización o actualización del máximo alcanzado
    let newPm = pm;
    if (pm === 0 || currentPrice > pm) {
        newPm = currentPrice;
    }
    
    // El precio de corte (Stop) es el máximo menos el porcentaje de retroceso
    const newPc = newPm * (1 - trailingStopPercent);

    // Si el precio subió y generó un nuevo máximo, actualizamos la raíz
    if (newPm > pm) {
        log(`📈 [L-TRAILING] Subida detectada: ${newPm.toFixed(2)}. Nuevo Stop: ${newPc.toFixed(2)}`, 'info');

        await updateGeneralBotState({ 
            lpm: newPm, 
            lpc: newPc
            // ✅ lsprice ELIMINADO: Ya no ensuciamos la base de datos
        });
    }

    // 3. CONDICIÓN DE DISPARO
    if (acSelling >= MIN_SELL_AMOUNT_BTC) {
        
        // El precio de corte actual (usamos el de la DB o el recién calculado)
        const currentStop = pc > 0 ? pc : newPc;
        
        // GATILLO: Si el precio cae y toca el Stop
        if (currentPrice <= currentStop) {
            log(`💰 [L-SELL] GATILLO ACTIVADO. Precio: ${currentPrice.toFixed(2)} <= Stop: ${currentStop.toFixed(2)}. Vendiendo todo.`, 'success');
            
            try {
                // Pasamos a ejecutar la venta a mercado
                await placeLongSellOrder(config, botState, acSelling, log, updateGeneralBotState); 
            } catch (error) {
                log(`❌ Error crítico en ejecución de venta: ${error.message}`, 'error');
                
                // Si el error es por falta de balance real en el exchange, detenemos para evitar bucles
                if (error.message.includes('Balance not enough') || error.message.includes('volume too small')) {
                    log('⚠️ Desfase de inventario detectado. Estado: PAUSED.', 'error');
                    await updateBotState('PAUSED', LSTATE); 
                }
            }
        } else {
            // Heartbeat de monitoreo (informativo para consola)
            const profitActual = (((currentPrice / botState.lppc) - 1) * 100).toFixed(2);
            const distToStop = (((currentPrice / currentStop) - 1) * 100).toFixed(2);
            
            // En Selling Long, el Stop siempre está abajo, por eso forzamos el '-' 
    // pero mantenemos la lógica de comparación por seguridad.
    const signStop = currentStop > currentPrice ? '+' : '-';

    log(`[L-SELLING] 👁️ BTC: ${currentPrice.toFixed(2)} | Profit: +${profitActual}% | Stop: ${currentStop.toFixed(2)} (${signStop}${distToStop}%)`, 'info');
}
    } else {
        log(`[L-SELLING] ⚠️ No hay suficiente cantidad acumulada (lac) para vender.`, 'warning');
        // Opcional: Si lac es 0, volver a estado inicial para evitar quedarse atrapado
        if (acSelling <= 0) await updateBotState('BUYING', LSTATE);
    }
}

module.exports = { run };