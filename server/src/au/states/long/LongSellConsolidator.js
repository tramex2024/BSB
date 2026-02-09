// BSB/server/src/au/states/long/LongSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulSell } = require('../../managers/longDataManager');
const { logSuccessfulCycle } = require('../../../../services/cycleLogService'); 

/**
 * VIGILANCIA DE VENTA: Confirma el cierre del ciclo Long.
 * @param {userId} - Inyectado para asegurar que consultamos la API Key correcta.
 */
async function monitorAndConsolidateSell(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState, userId) {
    
    const lastOrder = botState.llastOrder;

    // Validación de seguridad para evitar procesar órdenes de compra aquí
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        // 1. CONSULTA AISLADA: Pasamos userId para usar su API KEY
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString, userId);
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);

        // Respaldo: Si la API no responde el detalle, buscamos en el historial reciente del usuario
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL, userId);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // === CASO A: VENTA CONFIRMADA (Ciclo Exitoso) ===
        if (isFilled) {
            log(`💰 [L-SELL-SUCCESS] Venta confirmada. Procesando liquidación de ciclo...`, 'success');
            
            const handlerDependencies = { 
                log, 
                updateBotState, 
                updateLStateData, 
                updateGeneralBotState, 
                logSuccessfulCycle,
                userId, // Identidad para persistencia de profit en BD
                config: botState.config
            };
            
            // Enviamos al manager para calcular profit neto y resetear variables de raíz
            await handleSuccessfulSell(botState, finalDetails, handlerDependencies);

            return true;
        }

        // === CASO B: LA ORDEN SIGUE ACTIVA ===
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            return true; 
        }

        // === CASO C: CANCELACIÓN MANUAL O POR ERROR ===
        if (isCanceled) {
            log(`⚠️ [L-SELL-CANCEL] Orden de venta cancelada en Exchange. Liberando slot para reintento.`, 'warning');
            
            // Limpiamos llastOrder para que LSelling.js pueda volver a colocar la orden si el precio sigue bajo el stop
            await updateGeneralBotState({ llastOrder: null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[L-SELL-ERROR] Error en monitoreo (User: ${userId}): ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateSell };