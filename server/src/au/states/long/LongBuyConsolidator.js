// BSB/server/src/au/states/long/LongBuyConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulBuy } = require('../../managers/longDataManager'); 

/**
 * Monitorea órdenes de compra y delega la consolidación al Data Manager.
 */
async function monitorAndConsolidate(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState) {
    
    // ✅ CAMBIO: Ahora leemos la orden directamente de la raíz
    const lastOrder = botState.llastOrder;

    // Si no hay orden pendiente o no es de compra, no hay nada que consolidar aquí
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);

        // Lógica de Respaldo
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // --- CASO 1: ÉXITO ---
        if (isFilled) {
            log(`[CONSOLIDATOR] ✅ Compra confirmada: ${orderIdString}. Actualizando promedios y targets...`, 'success');
            
            const dependencies = { updateGeneralBotState, updateLStateData };
            
            // Enviamos a handleSuccessfulBuy que ya configuramos para procesar siglas de raíz
            await handleSuccessfulBuy(botState, finalDetails, log, dependencies);
            
            return true; 
        } 

        // --- CASO 2: ORDEN ACTIVA ---
        if (finalDetails && ['new', 'partially_filled'].includes(finalDetails.state)) {
            return true; 
        } 

        // --- CASO 3: FALLO / CANCELACIÓN ---
        if (isCanceled && filledVolume === 0) {
            log(`[CONSOLIDATOR] ❌ Orden ${orderIdString} cancelada. Liberando estado para reintento.`, 'error');
            
            // ✅ CAMBIO: Limpiamos llastOrder en la raíz
            await updateGeneralBotState({ llastOrder: null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[CONSOLIDATOR] ⚠️ Error en monitoreo: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidate };