// BSB/server/src/au/states/short/ShortBuyConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortBuy } = require('../../managers/shortDataManager');
const { logSuccessfulCycle } = require('../../../../services/cycleLogService'); 

/**
 * CONSOLIDADOR DE RECOMPRA (SHORT): 
 * Confirma el cierre del ciclo cuando se ejecuta el Take Profit (Buy Market).
 */
async function monitorAndConsolidateShortBuy(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState) {
    // ✅ MIGRADO: Leemos directamente de la raíz de la Estructura Plana
    const lastOrder = botState.slastOrder;

    // Un ciclo Short termina con una orden 'buy' (recompra para cerrar)
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        
        // Bitmart puede devolver el volumen lleno en diferentes propiedades según el endpoint
        let filledVolume = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.filledVolume || 0
        );

        // Fallback: Si no hay detalles, buscamos en las órdenes recientes del exchange
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
            }
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // =================================================================
        // CASO A: RECOMPRA EXITOSA (Cierre de Ciclo con Profit)
        // =================================================================
        if (isFilled) {
            log(`💰 [S-BUY-SUCCESS] Recompra confirmada. Procesando cierre de ciclo Short...`, 'success');
            
            const handlerDependencies = { 
                log, 
                updateBotState, 
                updateSStateData, 
                updateGeneralBotState, 
                logSuccessfulCycle, 
                config: botState.config 
            };
            
            /**
             * handleSuccessfulShortBuy realizará:
             * 1. Cálculo de profit real (sai - costo de recompra).
             * 2. Registro en cycleLogService (Historial).
             * 3. Reset total de raíz: sac=0, sai=0, sppc=0, socc=0, slastOrder=null.
             * 4. Transición de estado: SELLING (si es exponencial continuo) o STOPPED.
             */
            await handleSuccessfulShortBuy(botState, finalDetails, handlerDependencies);

            return true;
        }

        // =================================================================
        // CASO B: ORDEN PENDIENTE (En el Order Book)
        // =================================================================
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            // El bot simplemente espera en el siguiente tick.
            return true; 
        }

        // =================================================================
        // CASO C: ORDEN CANCELADA O FALLIDA
        // =================================================================
        if (isCanceled && filledVolume === 0) {
            log(`❌ [S-BUY-FAIL] La recompra fue cancelada sin ejecutarse. Liberando slastOrder para reintento.`, 'error');
            // ✅ MIGRADO: Limpieza de slastOrder en raíz para permitir que el bot lo intente de nuevo
            await updateGeneralBotState({ 'slastOrder': null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[S-BUY-ERROR] Error crítico en consolidación Short Buy: ${error.message}`, 'error');
        // Retornamos true para no bloquear el ciclo por un error de red temporal
        return true; 
    }
}

module.exports = { monitorAndConsolidateShortBuy };