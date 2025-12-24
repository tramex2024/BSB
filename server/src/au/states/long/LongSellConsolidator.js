// BSB/server/src/au/states/long/LongSellConsolidator.js (CORREGIDO)

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulSell } = require('../../managers/longDataManager');

/**
 * Monitorea una orden de VENTA pendiente, consolida la posición si la orden se llena,
 * o limpia el lastOrder si la orden falla.
 */
async function monitorAndConsolidateSell(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState) {
    const lStateData = botState.lStateData;
    const lastOrder = lStateData.lastOrder;
    const LSTATE = 'long';

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false; // No hay orden de venta pendiente que monitorear
    }

    const orderIdString = String(lastOrder.order_id);
    log(`[SELL CONSOLIDATOR] Orden de venta pendiente ${orderIdString} detectada. Consultando BitMart...`, 'warning');

    try {
        let orderDetails = await getOrderDetail(SYMBOL, orderIdString);
        let finalDetails = orderDetails;
        
        // Consolidar campos de volumen llenado (filledSize/filled_volume/filledVolume)
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);

        // Definición de ORDEN PROCESADA (Total o Parcial)
        let isOrderProcessed = (
            finalDetails?.state === 'filled' ||
            finalDetails?.state === 'partially_canceled' ||
            (finalDetails?.state === 'canceled' && filledVolume > 0) ||
            filledVolume > 0
        );

        // 2. Lógica de Respaldo (Buscar en Historial si la consulta directa falla)
        if (!isOrderProcessed && !finalDetails) {
            log(`[SELL CONSOLIDATOR] Fallo en consulta directa. Buscando orden ${orderIdString} en el historial de BitMart...`, 'info');
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(order => 
                String(order.orderId) === orderIdString || String(order.order_id) === orderIdString
            );
            
            if (finalDetails) {
                // 💡 Consolidar volumen llenado de la respuesta de respaldo
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0); 
                isOrderProcessed = filledVolume > 0;
            }
        }

        if (isOrderProcessed && filledVolume > 0) {
            // === CASO A: VENTA PROCESADA CON ÉXITO (Cierre de Ciclo) ===
            log(`[SELL CONSOLIDATOR] Orden ${orderIdString} confirmada. Iniciando consolidación y CIERRE DE CICLO.`, 'success');
            
            const handlerDependencies = { 
                log, updateBotState, updateLStateData, updateGeneralBotState, 
                config: botState.config 
            };
            
            // 🎯 handleSuccessfulSell maneja la lógica de ganancias, reseteo de estado 
            // y la transición FINAL a BUYING o STOPPED (según stopAtCycle).
            await handleSuccessfulSell(botState, finalDetails, handlerDependencies);
            
            // 🛑 ELIMINADA la línea: await updateBotState('BUYING', LSTATE);
            log(`[SELL CONSOLIDATOR] Cierre de ciclo Long completo. Transición delegada a LongDataManager.`, 'debug');

            return true; // Orden procesada

        } else if (finalDetails && (finalDetails.state === 'new' || finalDetails.state === 'partially_filled')) {
            // === CASO B: ORDEN AÚN PENDIENTE ===
            log(`[SELL CONSOLIDATOR] La orden ${orderIdString} sigue activa (${finalDetails.state}). Esperando ejecución.`, 'info');
            return true; // Orden pendiente (mantiene el bloqueo)

        } else {
            // === CASO C: ORDEN FALLIDA SIN VOLUMEN LLENADO ===
            log(`[SELL CONSOLIDATOR] La orden ${orderIdString} falló/se canceló sin ejecución. Limpiando lastOrder para reintento.`, 'error');
            
            await updateLStateData({ 'lastOrder': null });
            
            // Permanecer en SELLING. El próximo ciclo de autobotLogic llamará a LSelling.run, que intentará colocar la orden de nuevo.
            await updateBotState('SELLING', LSTATE); 

            return true; // Orden procesada (fallida)
        }

    } catch (error) {
        log(`[SELL CONSOLIDATOR] Error de API/lógica al consultar la orden ${orderIdString}: ${error.message}. Persistiendo el bloqueo.`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateSell };