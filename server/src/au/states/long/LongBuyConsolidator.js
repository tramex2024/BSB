// BSB/server/src/au/states/long/LongBuyConsolidator.js (FINAL)

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulBuy } = require('../../managers/longDataManager'); 

/**
 * Monitorea una orden pendiente, consolida la posición si la orden se llena,
 * o limpia el lastOrder si la orden falla.
 */
async function monitorAndConsolidate(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState) {
    const lStateData = botState.lStateData;
    const lastOrder = lStateData.lastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);
    log(`[CONSOLIDATOR] Orden de compra pendiente ${orderIdString} detectada. Consultando BitMart...`, 'warning');

    try {
        let orderDetails = await getOrderDetail(SYMBOL, orderIdString);
        let finalDetails = orderDetails;
        
        // 💡 CORRECCIÓN: Consolidar todos los posibles nombres de campo para el volumen llenado
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);
        
        let isOrderProcessed = (
            finalDetails?.state === 'filled' ||
            finalDetails?.state === 'partially_canceled' ||
            (finalDetails?.state === 'canceled' && filledVolume > 0) ||
            filledVolume > 0
        );

        // Lógica de Respaldo
        if (!isOrderProcessed) {
            log(`[CONSOLIDATOR] Fallo en consulta directa. Buscando orden ${orderIdString} en el historial de BitMart...`, 'info');
            const recentOrders = await getRecentOrders(SYMBOL);
            
            // 💡 Nota: La comparación debe ser estricta para IDs que son strings o números
            finalDetails = recentOrders.find(order => String(order.orderId) === orderIdString || String(order.order_id) === orderIdString);
            
            if (finalDetails) {
                // Consolidar volumen llenado de la respuesta de respaldo
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || finalDetails.filled_volume || 0);
                isOrderProcessed = filledVolume > 0;
            }
        }

        if (isOrderProcessed && filledVolume > 0) {
            // === ORDEN PROCESADA CON ÉXITO (TOTAL O PARCIAL) ===
            log(`[CONSOLIDATOR] Orden ${orderIdString} confirmada. Iniciando consolidación atómica...`, 'success');
            
            // handleSuccessfulBuy es responsable de: 
            // 1. Calcular PPC, AC, etc.
            // 2. Limpiar lastOrder
            // 3. Persistir los cambios
            await handleSuccessfulBuy(botState, finalDetails, log); 
            
            // El Consolidator solo transiciona de vuelta a BUYING para reevaluar la posición (targets/cobertura)
            await updateBotState('BUYING', 'long'); 
            log(`[CONSOLIDATOR] Transición a BUYING para reevaluar targets.`, 'debug');

            return true; 

        } else if (finalDetails && (finalDetails.state === 'new' || finalDetails.state === 'partially_filled')) {
            // === ORDEN PENDIENTE ===
            log(`[CONSOLIDATOR] La orden ${orderIdString} sigue activa (${finalDetails.state}). Esperando ejecución.`, 'info');
            return true; 
            
        } else {
            // === ORDEN FALLIDA SIN VOLUMEN LLENADO ===
            log(`[CONSOLIDATOR] La orden ${orderIdString} falló/se canceló sin ejecución. Limpiando lastOrder.`, 'error');
            await updateLStateData({ 'lastOrder': null });
            
            // Transicionar de vuelta a BUYING para que el ciclo reintente la compra si las condiciones lo permiten.
            await updateBotState('BUYING', 'long'); 
            
            return true; 
        }

    } catch (error) {
        log(`[CONSOLIDATOR] Error de API/lógica al consultar la orden ${orderIdString}: ${error.message}. Persistiendo.`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidate };