//BSB/server/src/au/states/short/SBuying.js

const { placeShortBuyOrder } = require('../../managers/shortOrderManager');

const MIN_CLOSE_AMOUNT_BTC = 0.00001; 
const SSTATE = 'short';
const TRAILING_STOP_PERCENTAGE = 0.3; // Por defecto 0.3% de rebote

async function run(dependencies) {
    const { 
        userId, 
        botState, currentPrice, config, log, 
        updateSStateData, updateBotState, updateGeneralBotState,
        logSuccessfulCycle 
    } = dependencies;
    
    if (!currentPrice || currentPrice <= 0) return;

    const slastOrder = botState.slastOrder;  
    const acBuying = parseFloat(botState.sac || 0); // Short Accumulated Coins
    const pm = parseFloat(botState.spm || 0);       // Suelo (mínimo alcanzado)
    const pc = parseFloat(botState.spc || 0);       // Stop de recompra

    // 1. BLOQUEO DE SEGURIDAD
    if (slastOrder) {
        log(`[S-BUYING] ⏳ Orden activa detectada en BitMart. Esperando consolidación...`, 'debug');
        return;
    }

    // 2. LÓGICA DE TRAILING STOP INVERSO (Perseguir el fondo)
    const configPercent = config.short?.trailing_percent || TRAILING_STOP_PERCENTAGE;
    const trailingStopPercent = configPercent / 100;

    // Inicialización del suelo (pm - Peak Market en Short)
    let currentMin = (pm > 0) ? pm : currentPrice;
    
    // Si el precio actual es el nuevo mínimo, lo capturamos (Trailing)
    const newPm = Math.min(currentMin, currentPrice);
    
    // El precio de recompra (PC) es el suelo + el margen de rebote configurado
    const newPc = newPm * (1 + trailingStopPercent);

    // Si encontramos un nuevo suelo (o es el primer tick del estado)
    if (newPm < pm || pm === 0) {
        log(`📉 [S-TRAILING] Nuevo Suelo: ${newPm.toFixed(2)} | Stop de Recompra (PC): ${newPc.toFixed(2)} (+${configPercent}%)`, 'info');

        await updateGeneralBotState({ 
            spm: newPm, 
            spc: newPc
        });
    }

    // 3. CONDICIÓN DE DISPARO (TRIGGER)
    if (acBuying >= MIN_CLOSE_AMOUNT_BTC) {
        
        const triggerPrice = pc > 0 ? pc : newPc;

        // TRIGGER: Si el precio rebota hacia ARRIBA y toca el Stop de recompra
        if (currentPrice >= triggerPrice) {
            log(`💰 [S-CLOSE] Rebote confirmado: ${currentPrice.toFixed(2)} >= ${triggerPrice.toFixed(2)}. Cerrando Short...`, 'success');
            
            try {
                // PASAMOS EL userId PARA QUE EL MANAGER FIRME CON LAS API KEYS CORRECTAS
                await placeShortBuyOrder(config, botState, acBuying, log, updateSStateData, currentPrice, {
                    logSuccessfulCycle,
                    updateBotState,
                    updateGeneralBotState,
                    userId 
                }); 
            } catch (error) {
                log(`❌ Error crítico en recompra Short: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough')) {
                    log('⚠️ Saldo USDT insuficiente para cerrar el Short.', 'error');
                    await updateBotState('PAUSED', SSTATE); 
                }
            }
        } else {
            // Heartbeat: Monitoreo de distancia al cierre
            const distToClose = ((triggerPrice / currentPrice - 1) * 100).toFixed(2);
            log(`[S-BUYING] 👁️ BTC: ${currentPrice.toFixed(2)} | Piso: ${newPm.toFixed(2)} | Stop: ${triggerPrice.toFixed(2)} (+${distToClose}%)`, 'info');
        }
    } else {
        log(`[S-BUYING] ⚠️ No hay activos (sac) para cerrar.`, 'warning');
        // Si no hay posición y no hay orden, volvemos a buscar señales de venta
        if (acBuying <= 0 && !slastOrder) await updateBotState('SELLING', SSTATE);
    }
}

module.exports = { run };