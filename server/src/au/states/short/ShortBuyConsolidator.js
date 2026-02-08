// BSB/server/src/au/states/short/ShortBuyConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortBuy } = require('../../managers/shortDataManager');
const { logSuccessfulCycle } = require('../../../../services/cycleLogService'); 

/**
 * CONSOLIDADOR DE RECOMPRA (SHORT): 
 * Confirma el cierre del ciclo cuando se ejecuta el Take Profit (Buy Market).
 * @param {string} userId - ID del usuario dueño del bot.
 */
async function monitorAndConsolidateShortBuy(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState, userId) {
    const lastOrder = botState.slastOrder;

    // Un ciclo Short termina con una orden 'buy' (recompra para cerrar la deuda)
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        // Consultamos BitMart usando las credenciales/contexto del usuario
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString, userId);
        
        let filledVolume = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.filledVolume || 0
        );

        // Fallback: Si no hay detalles, buscamos en historial reciente del usuario
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL, userId);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
            }
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // === CASO A: RECOMPRA EXITOSA (CIERRE DE CICLO) ===
        if (isFilled) {
            log(`💰 [S-BUY-SUCCESS] Short cerrado con éxito. Procesando profit...`, 'success');
            
            const handlerDependencies = { 
                userId, // <--- PASAMOS EL ADN DEL USUARIO
                log, 
                updateBotState, 
                updateSStateData, 
                updateGeneralBotState, 
                logSuccessfulCycle, 
                config: botState.config 
            };
            
            // El manager invocará saveExecutedOrder(..., userId), notificando al Dashboard correcto
            await handleSuccessfulShortBuy(botState, finalDetails, handlerDependencies);
            return true;
        }

        // === CASO B: ORDEN PENDIENTE ===
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            return true; 
        }

        // === CASO C: ORDEN CANCELADA O FALLIDA ===
        if (isCanceled) {
            log(`⚠️ [S-BUY-CANCEL] Recompra cancelada en exchange. Liberando estado para reintento.`, 'warning');
            // Limpiamos slastOrder para que el bot pueda volver a intentar cerrar
            await updateGeneralBotState({ 'slastOrder': null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[S-BUY-ERROR] Error crítico en consolidación Short Buy: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShortBuy };