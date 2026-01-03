// BSB/server/src/au/states/short/ShortSellConsolidator.js (ESPEJO DE LongBuyConsolidator.js)

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortSell } = require('../../managers/shortDataManager'); 

/**
 * Monitorea una orden de VENTA pendiente (Short), consolida la posición si se llena,
 * o limpia el lastOrder si la orden falla.
 */
async function monitorAndConsolidateShort(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState) {
    const sStateData = botState.sStateData;
    const lastOrder = sStateData.lastOrder;

    // Solo actuamos si hay una orden de VENTA (short) bloqueada
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);
    log(`[S-CONSOLIDATOR] Orden de venta pendiente ${orderIdString} detectada. Consultando BitMart...`, 'warning');

    try {
        let orderDetails = await getOrderDetail(SYMBOL, orderIdString);
        let finalDetails = orderDetails;
        
        // Consolidación de campos de volumen (BitMart varía nombres según el endpoint)
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);
        
        let isOrderProcessed = (
            finalDetails?.state === 'filled' ||
            finalDetails?.state === 'partially_canceled' ||
            (finalDetails?.state === 'canceled' && filledVolume > 0) ||
            filledVolume > 0
        );

        // Lógica de Respaldo (Historial)
        if (!isOrderProcessed) {
            log(`[S-CONSOLIDATOR] Buscando orden ${orderIdString} en el historial de respaldo...`, 'info');
            const recentOrders = await getRecentOrders(SYMBOL);
            
            finalDetails = recentOrders.find(order => 
                String(order.orderId) === orderIdString || String(order.order_id) === orderIdString
            );
            
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || finalDetails.filled_volume || 0);
                isOrderProcessed = filledVolume > 0;
            }
        }

        if (isOrderProcessed && filledVolume > 0) {
            // === VENTA PROCESADA (APERTURA O COBERTURA) ===
            log(`[S-CONSOLIDATOR] Venta ${orderIdString} confirmada. Consolidando Short...`, 'success');
            
            // handleSuccessfulShortSell calcula PPC, actualiza deuda BTC (AC) y limpia lastOrder
            await handleSuccessfulShortSell(botState, finalDetails, log); 
            
            // Transicionamos de vuelta a SELLING para que el bot reevalúe targets de cobertura y TP
            await updateBotState('SELLING', 'short'); 
            log(`[S-CONSOLIDATOR] Transición a SELLING para reevaluar targets Short.`, 'debug');

            return true; 

        } else if (finalDetails && (finalDetails.state === 'new' || finalDetails.state === 'partially_filled')) {
            // === ORDEN PENDIENTE EN LIBRO ===
            log(`[S-CONSOLIDATOR] Orden ${orderIdString} aún activa (${finalDetails.state}).`, 'info');
            return true; 
            
        } else {
            // === ORDEN FALLIDA / CANCELADA SIN LLENAR ===
            log(`[S-CONSOLIDATOR] Orden ${orderIdString} falló sin ejecución. Liberando bloqueo.`, 'error');
            await updateSStateData({ 'lastOrder': null });
            
            // Volvemos a SELLING para que el ciclo intente colocar la orden de nuevo si el precio sigue ahí
            await updateBotState('SELLING', 'short'); 
            
            return true; 
        }

    } catch (error) {
        log(`[S-CONSOLIDATOR] Error al consultar orden ${orderIdString}: ${error.message}`, 'error');
        return true; // Retornamos true para no romper el ciclo del bot
    }
}

module.exports = { monitorAndConsolidateShort };