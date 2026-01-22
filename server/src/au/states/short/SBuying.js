// BSB/server/src/au/states/short/SBuying.js

const { placeShortBuyOrder } = require('../../managers/shortOrderManager');

const MIN_CLOSE_AMOUNT_BTC = 0.00001; 
const SSTATE = 'short';
const TRAILING_STOP_PERCENTAGE = 0.3; // 0.3% de rebote para cerrar

async function run(dependencies) {
    const { 
        botState, currentPrice, config, log, 
        updateSStateData, updateBotState, updateGeneralBotState,
        logSuccessfulCycle 
    } = dependencies;
    
    if (!currentPrice || currentPrice <= 0) return;

    // ✅ MIGRADO: Estructura Plana
    const slastOrder = botState.slastOrder;  
    const acBuying = parseFloat(botState.sac || 0); // Short Accumulated Coins
    const pm = parseFloat(botState.spm || 0);       // Suelo (mínimo alcanzado)
    const pc = parseFloat(botState.spc || 0);       // Stop Recompra (Precio de corte)

    // 1. BLOQUEO DE SEGURIDAD: Evita enviar múltiples órdenes de recompra
    if (slastOrder) {
        log(`[S-BUYING] ⏳ Orden activa detectada. Esperando consolidación...`, 'debug');
        return;
    }

    // 2. LÓGICA DE TRAILING STOP INVERSO
    const trailingStopPercent = (config.short?.trailing_percent || TRAILING_STOP_PERCENTAGE) / 100;

    // Inicialización del suelo (pm) si es la primera vez que entramos al estado
    let currentMin = (pm > 0) ? pm : currentPrice;
    
    // Si el precio actual es el nuevo mínimo, lo capturamos
    const newPm = Math.min(currentMin, currentPrice);
    
    // El precio de cierre es el suelo + el margen de rebote
    const newPc = newPm * (1 + trailingStopPercent);

    // Si encontramos un nuevo suelo, arrastramos el Stop hacia abajo
    if (newPm < pm || pm === 0) {
        log(`📉 [S-TRAILING] Precio bajando. Nuevo Suelo: ${newPm.toFixed(2)}. Recompra ajustada a: ${newPc.toFixed(2)}`, 'info');

        // Actualizamos en raíz spm (Suelo) y spc (Stop)
        await updateGeneralBotState({ 
            spm: newPm, 
            spc: newPc,
            sbprice: newPc // Sincronización para el Dashboard
        });
    }

    // 3. CONDICIÓN DE DISPARO (EL REBOTE)
    if (acBuying >= MIN_CLOSE_AMOUNT_BTC) {
        
        const triggerPrice = pc > 0 ? pc : newPc;

        // Disparo: Si el precio rebota y cruza el Stop hacia ARRIBA
        if (currentPrice >= triggerPrice) {
            log(`💰 [S-CLOSE] Rebote confirmado: ${currentPrice.toFixed(2)} >= ${triggerPrice.toFixed(2)}. Ejecutando Recompra...`, 'success');
            
            try {
                // El manager se encargará de mandar la orden y llamar al consolidatór
                await placeShortBuyOrder(config, botState, acBuying, log, updateSStateData, currentPrice, {
                    logSuccessfulCycle,
                    updateBotState,
                    updateGeneralBotState
                }); 
            } catch (error) {
                log(`❌ Error crítico en recompra Short: ${error.message}`, 'error');
                
                if (error.message.includes('Balance not enough')) {
                    log('⚠️ El bot intentó recomprar sin USDT suficiente. Revisar balance.', 'error');
                    await updateBotState('NO_COVERAGE', SSTATE); 
                }
            }
        } else {
            // Log de seguimiento
            const distAlCierre = (((triggerPrice / currentPrice) - 1) * 100).toFixed(2);
            log(`[S-BUYING] 👁️ BTC: ${currentPrice.toFixed(2)} | Suelo: ${newPm.toFixed(2)} | Stop Recompra: ${triggerPrice.toFixed(2)} (Dist: ${distAlCierre}%)`, 'info');
        }
    } else {
        log(`[S-BUYING] ⚠️ No hay monedas acumuladas (sac) para cerrar el Short.`, 'warning');
        if (acBuying <= 0) await updateBotState('SELLING', SSTATE); // Reset por seguridad
    }
}

module.exports = { run };