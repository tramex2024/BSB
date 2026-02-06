// BSB/server/src/states/short/ShortSellConsolidator.js (Espejo de LongBuyConsolidator.js)

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
// 🛑 Importamos la función atómica para consolidar la VENTA Short
const { handleSuccessfulSellShort } = require('../../managers/shortDataManager');

/**
 * Monitorea una orden de VENTA Short pendiente, consolida la posición si la orden se llena,
 * o limpia el lastOrder si la orden falla.
 *
 * @param {object} botState - Estado actual del bot.
 * @param {string} SYMBOL - Símbolo de trading.
 * @param {function} log - Función de logging.
 * @param {function} updateSStateData - Función para actualizar solo sStateData.
 * @param {function} updateBotState - Función para actualizar el estado principal.
 * @param {function} updateGeneralBotState - Función para actualizar el botState (para handleSuccessfulSellShort).
 * @returns {boolean} true si se procesó una orden, false si sigue pendiente o no hay orden.
 */
async function monitorAndConsolidateShort(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState) {
    const sStateData = botState.sStateData;
    const lastOrder = sStateData.lastOrder;

    // 🛑 Validar que haya una orden pendiente y que sea de VENTA
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        // No hay orden de VENTA Short pendiente para monitorear
        return false;
    }

    const orderIdString = String(lastOrder.order_id);
    log(`[CONSOLIDATOR SHORT] Orden de VENTA pendiente ${orderIdString} detectada. Consultando BitMart...`, 'warning');

    try {
        let orderDetails = await getOrderDetail(SYMBOL, orderIdString);
        let finalDetails = orderDetails;
        // 🛑 Cantidad llenada (en BTC/Asset)
        let filledVolume = parseFloat(finalDetails?.filledSize || 0);
        
        let isOrderProcessed = (
            finalDetails?.state === 'filled' ||
            finalDetails?.state === 'partially_canceled' ||
            (finalDetails?.state === 'canceled' && filledVolume > 0) ||
            filledVolume > 0
        );

        // Lógica de Respaldo (Búsqueda en el historial si la consulta directa falla)
        if (!isOrderProcessed) {
            log(`[CONSOLIDATOR SHORT] Fallo en consulta directa. Buscando orden ${orderIdString} en el historial de BitMart...`, 'info');
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(order => order.orderId === orderIdString || order.order_id === orderIdString);
            
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
                isOrderProcessed = filledVolume > 0;
            }
        }

        if (isOrderProcessed && filledVolume > 0) {
            // === ORDEN PROCESADA CON ÉXITO (TOTAL O PARCIAL) ===
            log(`[CONSOLIDATOR SHORT] Orden ${orderIdString} confirmada. Iniciando consolidación atómica...`, 'success');
            
            // 🛑 LLAMADA A LA FUNCIÓN ATÓMICA EN SHORT DATA MANAGER
            await handleSuccessfulSellShort(botState, finalDetails, log); 
            
            // 🛑 Transición a RUNNING, ya que después de consolidar una venta Short (apertura/cobertura), el bot está listo para reevaluar targets.
            await updateBotState('RUNNING', 'short'); 
            log(`[CONSOLIDATOR SHORT] Transición a RUNNING para reevaluar targets.`, 'debug');

            return true; // Se procesó una orden

        } else if (finalDetails && (finalDetails.state === 'new' || finalDetails.state === 'partially_filled')) {
            // === ORDEN PENDIENTE ===
            log(`[CONSOLIDATOR SHORT] La orden ${orderIdString} sigue activa (${finalDetails.state}). Esperando ejecución.`, 'info');
            return true; // Hay una orden pendiente, no proceder
            
        } else {
            // === ORDEN FALLIDA SIN VOLUMEN LLENADO ===
            log(`[CONSOLIDATOR SHORT] La orden ${orderIdString} falló/se canceló sin ejecución. Limpiando lastOrder.`, 'error');
            // 🛑 Limpiar lastOrder en sStateData
            await updateSStateData({ 'lastOrder': null }); 
            
            // 🛑 CORRECCIÓN: Si falla, regresa a SELLING (gestión de posición Short)
            await updateBotState('SELLING', 'short'); 
            
            return true; // Se procesó (falló) una orden, no proceder al resto del estado
        }

    } catch (error) {
        log(`[CONSOLIDATOR SHORT] Error de API/lógica al consultar la orden ${orderIdString}: ${error.message}. Persistiendo.`, 'error');
        // Si hay error de API, retornamos true para no intentar colocar nuevas órdenes.
        return true; 
    }
}

module.exports = { monitorAndConsolidateShort };