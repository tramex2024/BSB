// BSB/server/src/au/states/short/ShortBuyConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortBuy } = require('../../managers/shortDataManager');
const { logSuccessfulCycle } = require('../../../../services/cycleLogService'); 

/**
 * CONSOLIDADOR DE RECOMPRA (SHORT): 
 * Confirma el cierre del ciclo cuando se ejecuta el Take Profit (Buy Market).
 * 🟢 AUDITORÍA: Añadido userCreds para consistencia con la firma V4.
 */
async function monitorAndConsolidateShortBuy(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState, userId, userCreds) {
    const lastOrder = botState.slastOrder;

    // En Short, el ciclo se cierra con una compra ('buy')
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);
    // 🟢 CORRECCIÓN: Usamos las credenciales inyectadas correctamente
    const creds = userCreds;

    try {
        // 🟢 CORRECCIÓN: Pasamos 'creds' para la autenticación
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString, creds);
        
        let filledVolume = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.filledVolume || 0
        );

        // Fallback: Verificación en historial si la consulta directa falla
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL, creds);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
            }
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // === CASO A: RECOMPRA EXITOSA (CIERRE DE CICLO) ===
        if (isFilled) {
            log(`💰 [S-BUY-SUCCESS] Recompra confirmada. BTC recomprados: ${filledVolume.toFixed(6)}. Liquidando ciclo...`, 'success');
            
            const handlerDependencies = { 
                userId, 
                log, 
                updateBotState, 
                updateSStateData, 
                updateGeneralBotState, 
                logSuccessfulCycle, 
                config: botState.config 
            };
            
            // El manager limpia el estado (CLEAN_SHORT_ROOT) y registra el profit
            await handleSuccessfulShortBuy(botState, { ...finalDetails, filledVolume }, handlerDependencies);
            
            // 🟢 AUDITORÍA: Retornamos false porque la orden ya no está activa
            return false;
        }

        // === CASO B: ORDEN AÚN EN EL LIBRO ===
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            return true; // Mantiene el bloqueo de slastOrder
        }

        // === CASO C: CANCELACIÓN O FALLO ===
        if (isCanceled) {
            log(`⚠️ [S-BUY-CANCEL] Orden de recompra cancelada. Liberando para reintento.`, 'warning');
            await updateGeneralBotState({ 'slastOrder': null });
            return false;
        }

        return true;

    } catch (error) {
        log(`[S-BUY-ERROR] Error en monitoreo (User: ${userId}): ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShortBuy };