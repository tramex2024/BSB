// BSB/server/src/au/states/short/ShortBuyConsolidator.js (ESPEJO DE LongSellConsolidator.js)

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortBuy } = require('../../managers/shortDataManager');

/**
 * Monitorea una orden de COMPRA pendiente (Cierre de Short), consolida la posición 
 * si se llena, o limpia el lastOrder si falla.
 */
async function monitorAndConsolidateShortBuy(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState) {
    const sStateData = botState.sStateData;
    const lastOrder = sStateData.lastOrder;
    const SSTATE = 'short';

    // En Short, el cierre del ciclo ocurre con una orden de side 'buy'
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);
    log(`[S-BUY CONSOLIDATOR] Orden de recompra (TP) pendiente ${orderIdString} detectada.`, 'warning');

    try {
        let orderDetails = await getOrderDetail(SYMBOL, orderIdString);
        let finalDetails = orderDetails;
        
        // Consolidar volumen llenado
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);

        // Definición de ORDEN PROCESADA
        let isOrderProcessed = (
            finalDetails?.state === 'filled' ||
            finalDetails?.state === 'partially_canceled' ||
            (finalDetails?.state === 'canceled' && filledVolume > 0) ||
            filledVolume > 0
        );

        // 2. Lógica de Respaldo
        if (!isOrderProcessed && !finalDetails) {
            log(`[S-BUY CONSOLIDATOR] Buscando orden ${orderIdString} en historial...`, 'info');
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(order => 
                String(order.orderId) === orderIdString || String(order.order_id) === orderIdString
            );
            
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0); 
                isOrderProcessed = filledVolume > 0;
            }
        }

        if (isOrderProcessed && filledVolume > 0) {
            // === RECOMPRA PROCESADA (CIERRE DE SHORT) ===
            log(`[S-BUY CONSOLIDATOR] Recompra ${orderIdString} confirmada. Cerrando ciclo Short...`, 'success');
            
            const handlerDependencies = { 
                log, updateBotState, updateSStateData, updateGeneralBotState, 
                config: botState.config 
            };
            
            // handleSuccessfulShortBuy calcula profit neto, resetea sStateData y transiciona
            await handleSuccessfulShortBuy(botState, finalDetails, handlerDependencies);
            
            log(`[S-BUY CONSOLIDATOR] Cierre de ciclo Short completo.`, 'debug');
            return true;

        } else if (finalDetails && (finalDetails.state === 'new' || finalDetails.state === 'partially_filled')) {
            // === ORDEN AÚN PENDIENTE EN EL LIBRO ===
            log(`[S-BUY CONSOLIDATOR] Recompra ${orderIdString} activa (${finalDetails.state}).`, 'info');
            return true;

        } else {
            // === ORDEN FALLIDA ===
            log(`[S-BUY CONSOLIDATOR] Recompra ${orderIdString} falló. Liberando lastOrder.`, 'error');
            await updateSStateData({ 'lastOrder': null });
            
            // Permanecer en BUYING para que SBuying.run intente recomprar de nuevo
            await updateBotState('BUYING', SSTATE); 

            return true;
        }

    } catch (error) {
        log(`[S-BUY CONSOLIDATOR] Error: ${error.message}. Persistiendo bloqueo.`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShortBuy };