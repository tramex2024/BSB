// BSB/server/src/au/states/long/LongSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulSell } = require('../../managers/longDataManager');
const { logSuccessfulCycle } = require('../../../../services/cycleLogService'); 

/**
 * VIGILANCIA DE VENTA: Confirma el cierre del ciclo Long.
 * Optimizada para no dejar rastro de órdenes antiguas y notificar al frontend.
 */
async function monitorAndConsolidateSell(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState) {
    
    const lastOrder = botState.llastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);

        // Respaldo Atómico: Verificación en historial si falla la consulta directa
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // === CASO A: VENTA CONFIRMADA ===
        if (isFilled) {
            log(`💰 [L-SELL-SUCCESS] Venta confirmada @ ${finalDetails.priceAvg || 'Market'}. Cerrando ciclo...`, 'success');
            
            const handlerDependencies = { 
                log, 
                updateBotState, 
                updateLStateData, 
                updateGeneralBotState, 
                logSuccessfulCycle,
                config: botState.config
            };
            
            // Este manager ahora disparará saveExecutedOrder, el cual notificará al socket.
            await handleSuccessfulSell(botState, finalDetails, handlerDependencies);

            return true;
        }

        // === CASO B: LA ORDEN SIGUE EN EL LIBRO ===
        // No hacemos nada, dejamos que el bot espere en el siguiente tic.
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            return true; 
        }

        // === CASO C: FALLO O CANCELACIÓN ===
        if (isCanceled) {
            log(`⚠️ [L-SELL-CANCEL] La orden de venta fue cancelada en el exchange.`, 'warning');
            
            // Limpiamos la orden de la raíz para permitir que el bot decida si re-vende o espera.
            await updateGeneralBotState({ llastOrder: null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[L-SELL-ERROR] Error crítico: ${error.message}`, 'error');
        // Importante: No limpiamos llastOrder aquí para reintentar en el siguiente ciclo.
        return true; 
    }
}

module.exports = { monitorAndConsolidateSell };