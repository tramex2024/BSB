// BSB/server/src/states/long/LongBuyConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService');
const { handleSuccessfulBuy } = require('../../managers/longDataManager'); // Se asume que no necesita updateGeneralBotState

/**
 * Monitorea una orden pendiente, consolida la posición si la orden se llena,
 * o limpia el lastOrder si la orden falla.
 *
 * @param {object} botState - Estado actual del bot.
 * @param {string} SYMBOL - Símbolo de trading.
 * @param {function} log - Función de logging.
 * @param {function} updateLStateData - Función para actualizar solo lStateData.
 * @param {function} updateBotState - Función para actualizar el estado principal.
 * @param {function} updateGeneralBotState - Función para actualizar el botState (para handleSuccessfulBuy). // YA NO SE USA EN LA LLAMADA
 * @returns {boolean} true si se procesó una orden, false si sigue pendiente o no hay orden.
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
        let filledVolume = parseFloat(finalDetails?.filledSize || 0);
        
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
            finalDetails = recentOrders.find(order => order.orderId === orderIdString || order.order_id === orderIdString);
            
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
                isOrderProcessed = filledVolume > 0;
            }
        }

        if (isOrderProcessed && filledVolume > 0) {
            // === ORDEN PROCESADA CON ÉXITO (TOTAL O PARCIAL) ===
            log(`[CONSOLIDATOR] Orden ${orderIdString} confirmada. Iniciando consolidación atómica...`, 'success');
            
            // 🛑 CORRECCIÓN DE LA FIRMA (Argumentos): handleSuccessfulBuy solo necesita 3 argumentos.
            await handleSuccessfulBuy(botState, finalDetails, log); 
            
            // 🎯 CORRECCIÓN DE LA TRANSICIÓN: Regresar a BUYING (gestión de posición).
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
            
            await updateBotState('BUYING', 'long'); 
            
            return true; 
        }

    } catch (error) {
        log(`[CONSOLIDATOR] Error de API/lógica al consultar la orden ${orderIdString}: ${error.message}. Persistiendo.`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidate };