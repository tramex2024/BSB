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

    // En Short, el ciclo se cierra con una compra ('buy') para devolver los activos "prestados"
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        // Consultamos BitMart usando el contexto del usuario para acceder a sus API Keys
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString, userId);
        
        let filledVolume = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.filledVolume || 0
        );

        // Fallback: Verificación en historial si la consulta directa no devuelve datos claros
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL, userId);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
            }
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // === CASO A: RECOMPRA EXITOSA (CIERRE DE POSICIÓN) ===
        if (isFilled) {
            log(`💰 [S-BUY-SUCCESS] Recompra confirmada. Liquidando ciclo y calculando profit...`, 'success');
            
            const handlerDependencies = { 
                userId, // Identidad inyectada para el historial de ciclos y balance
                log, 
                updateBotState, 
                updateSStateData, 
                updateGeneralBotState, 
                logSuccessfulCycle, 
                config: botState.config 
            };
            
            // El manager se encarga de saveExecutedOrder y resetear el CLEAN_SHORT_ROOT
            await handleSuccessfulShortBuy(botState, finalDetails, handlerDependencies);
            return true;
        }

        // === CASO B: ORDEN AÚN EN EL LIBRO (Lógica de espera) ===
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            return true; 
        }

        // === CASO C: CANCELACIÓN O FALLO DE EJECUCIÓN ===
        if (isCanceled) {
            log(`⚠️ [S-BUY-CANCEL] Orden de recompra cancelada. Liberando slot para reintento inmediato.`, 'warning');
            
            // Limpiamos la orden pendiente para que SBuying.js pueda re-intentar la compra
            await updateGeneralBotState({ 'slastOrder': null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[S-BUY-ERROR] Error en monitoreo (User: ${userId}): ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShortBuy };