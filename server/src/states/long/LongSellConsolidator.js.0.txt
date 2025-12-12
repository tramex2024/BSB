const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService');
const { handleSuccessfulSell } = require('../../managers/longDataManager');

/**
 * Monitorea una orden de VENTA pendiente, consolida la posición si la orden se llena,
 * o limpia el lastOrder si la orden falla.
 */
async function monitorAndConsolidateSell(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState) {
    const lStateData = botState.lStateData;
    const lastOrder = lStateData.lastOrder;
    const LSTATE = 'long'; // Para la función updateBotState

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false; // No hay orden de venta pendiente que monitorear
    }

    const orderIdString = String(lastOrder.order_id);
    log(`[SELL CONSOLIDATOR] Orden de venta pendiente ${orderIdString} detectada. Consultando BitMart...`, 'warning');

    try {
        let orderDetails = await getOrderDetail(SYMBOL, orderIdString);
        let finalDetails = orderDetails;
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || 0);

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
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
                isOrderProcessed = filledVolume > 0;
            }
        }

        if (isOrderProcessed && filledVolume > 0) {
            // === CASO A: VENTA PROCESADA CON ÉXITO (Cierre de Ciclo) ===
            log(`[SELL CONSOLIDATOR] Orden ${orderIdString} confirmada. Iniciando consolidación y CIERRE DE CICLO.`, 'success');
            
            const handlerDependencies = { log, updateBotState, updateLStateData, updateGeneralBotState, config: botState.config };
            await handleSuccessfulSell(botState, finalDetails, handlerDependencies);
            
            // 🎯 TRANSICIÓN CRÍTICA: Según tu aclaración, debe ir a BUYING para iniciar un nuevo ciclo
            await updateBotState('BUYING', LSTATE);
            log(`[SELL CONSOLIDATOR] Cierre de ciclo Long completo. Transición a BUYING.`, 'debug');

            return true; // Orden procesada

        } else if (finalDetails && (finalDetails.state === 'new' || finalDetails.state === 'partially_filled')) {
            // === CASO B: ORDEN AÚN PENDIENTE ===
            log(`[SELL CONSOLIDATOR] La orden ${orderIdString} sigue activa (${finalDetails.state}). Esperando ejecución.`, 'info');
            return true; // Orden pendiente (mantiene el bloqueo)

        } else {
            // === CASO C: ORDEN FALLIDA SIN VOLUMEN LLENADO ===
            log(`[SELL CONSOLIDATOR] La orden ${orderIdString} falló/se canceló sin ejecución. Limpiando lastOrder para reintento.`, 'error');
            
            // Desbloqueamos el ciclo
            await updateLStateData({ 'lastOrder': null });
            
            // Permanecer en SELLING para que LSelling.run se ejecute en el siguiente ciclo e intente colocar la orden de nuevo.
            await updateBotState('SELLING', LSTATE); 

            return true; // Orden procesada (fallida)
        }

    } catch (error) {
        // En caso de error de API (ej. timeout, 429), mantenemos el bloqueo para proteger la orden.
        log(`[SELL CONSOLIDATOR] Error de API/lógica al consultar la orden ${orderIdString}: ${error.message}. Persistiendo el bloqueo.`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateSell };