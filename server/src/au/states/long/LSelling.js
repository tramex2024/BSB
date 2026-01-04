// BSB/server/src/au/states/long/LSelling.js

const { placeSellOrder } = require('../../managers/longOrderManager');

const MIN_SELL_AMOUNT_BTC = 0.00005;
const LSTATE = 'long';
const TRAILING_STOP_PERCENTAGE = 0.4; // 0.4% de retroceso para vender

async function run(dependencies) {
    const { 
        botState, currentPrice, config, log, 
        updateLStateData, updateBotState, updateGeneralBotState 
    } = dependencies;
    
    const lastOrder = botState.lStateData.lastOrder; 
    const { ac: acSelling, pm, pc } = botState.lStateData;

    // 1. BLOQUEO DE SEGURIDAD
    // Si ya hay una orden de venta en curso, no hacemos nada. El Consolidator se encarga.
    if (lastOrder) {
        log(`[L-SELLING] ⏳ Esperando consolidación de orden de venta ${lastOrder.order_id}...`, 'debug');
        return;
    }

    // 2. LÓGICA DE TRAILING STOP
    const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100;

    // PM (Precio Máximo alcanzado) | PC (Precio de Corte/Venta)
    const newPm = Math.max(pm || 0, currentPrice);
    const newPc = newPm * (1 - trailingStopPercent);

    // Si el precio marca un nuevo máximo, subimos el Stop
    if (newPm > (pm || 0)) {
        log(`📈 [L-TRAILING] Nuevo máximo: ${newPm.toFixed(2)}. Stop sube a: ${newPc.toFixed(2)}`, 'info');

        await updateLStateData({ pm: newPm, pc: newPc });
        await updateGeneralBotState({ lsprice: newPc });
    }

    // 3. CONDICIÓN DE DISPARO
    // Solo vendemos si tenemos suficiente BTC y el precio cae por debajo del PC
    if (acSelling >= MIN_SELL_AMOUNT_BTC) {
        
        if (currentPrice <= (pc || newPc)) {
            log(`💰 [L-SELL] ¡Trailing Stop activado! Precio ${currentPrice.toFixed(2)} <= Stop ${pc?.toFixed(2)}. Liquidando ${acSelling.toFixed(8)} BTC.`, 'success');
            
            try {
                // placeSellOrder ya realiza el bloqueo atómico guardando lastOrder
                await placeSellOrder(config, botState, acSelling, log); 
            } catch (error) {
                log(`❌ Error crítico al intentar vender: ${error.message}`, 'error');
                
                // Si el error es por falta de fondos reales o volumen insignificante, protegemos el bot
                if (error.message.includes('Balance not enough') || error.message.includes('volume too small')) {
                    log('⚠️ Transicionando a NO_COVERAGE para revisión manual de balance BTC.', 'error');
                    await updateBotState('NO_COVERAGE', LSTATE); 
                }
            }
        } else {
            // Log de monitoreo silencioso
            log(`[L-SELLING] Vigilando... Precio: ${currentPrice.toFixed(2)} | Stop: ${pc?.toFixed(2)}`, 'debug');
        }
    } else {
        log(`[L-SELLING] ⚠️ AC insuficiente para vender (${acSelling.toFixed(8)} BTC).`, 'warning');
    }
}

module.exports = { run };