// BSB/server/src/au/states/long/LongBuyConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulBuy } = require('../../managers/longDataManager'); 

/**
 * Monitorea órdenes de compra y delega la consolidación al Data Manager.
 */
async function monitorAndConsolidate(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState) {
    // Acceso seguro a lStateData
    const lStateData = botState.lStateData || {};
    const lastOrder = lStateData.lastOrder;

    // Si no hay orden pendiente o no es de compra, no hay nada que consolidar aquí
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);

        // Lógica de Respaldo: Si la API no responde el detalle, buscamos en el historial reciente
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // --- CASO 1: ÉXITO (Procesamiento de la compra) ---
        if (isFilled) {
            log(`[CONSOLIDATOR] ✅ Compra confirmada: ${orderIdString}. Actualizando promedios y targets...`, 'success');
            
            // Pasamos las funciones de actualización al Manager
            const dependencies = { updateGeneralBotState, updateLStateData };
            
            /**
             * handleSuccessfulBuy es el CEREBRO que ahora debe leer:
             * botState.config.long.size_var
             * botState.config.long.trigger
             */
            await handleSuccessfulBuy(botState, finalDetails, log, dependencies);
            
            return true; // Retornamos true para indicar que hubo actividad y bloquear otros procesos este tick
        } 

        // --- CASO 2: ORDEN ACTIVA (En libro de órdenes) ---
        if (finalDetails && ['new', 'partially_filled'].includes(finalDetails.state)) {
            // Mientras la orden esté abierta, retornamos true para "bloquear" nuevas compras
            return true; 
        } 

        // --- CASO 3: FALLO / CANCELACIÓN ---
        if (isCanceled && filledVolume === 0) {
            log(`[CONSOLIDATOR] ❌ Orden ${orderIdString} cancelada. Liberando estado para reintento.`, 'error');
            await updateLStateData({ 'lastOrder': null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[CONSOLIDATOR] ⚠️ Error en monitoreo: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidate };