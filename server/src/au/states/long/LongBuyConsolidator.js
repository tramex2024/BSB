// BSB/server/src/au/states/long/LongBuyConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulBuy } = require('../../managers/longDataManager'); 

/**
 * Monitorea órdenes de compra y delega la consolidación al Data Manager.
 */
async function monitorAndConsolidate(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState) {
    const lStateData = botState.lStateData;
    const lastOrder = lStateData.lastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);

        // Lógica de Respaldo Atómica
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // --- CASO 1: ÉXITO (Delegamos todo al Brain/DataManager) ---
        if (isFilled) {
            log(`[CONSOLIDATOR] ✅ Ejecución detectada en ${orderIdString}. Procesando datos...`, 'success');
            
            const dependencies = { updateGeneralBotState, updateLStateData };
            
            // Aquí es donde el Data Manager recalcula el PPC y limpia el lastOrder
            await handleSuccessfulBuy(botState, finalDetails, log, dependencies);
            
            // Importante: No forzamos estados aquí, el flujo natural del bot seguirá 
            // su curso basado en los datos limpios que dejó handleSuccessfulBuy.
            return true; 
        } 

        // --- CASO 2: ORDEN ACTIVA (Esperamos) ---
        if (finalDetails && ['new', 'partially_filled'].includes(finalDetails.state)) {
            return true; 
        } 

        // --- CASO 3: FALLO / CANCELACIÓN ---
        if (isCanceled && filledVolume === 0) {
            log(`[CONSOLIDATOR] ❌ Orden ${orderIdString} cancelada sin ejecución. Reintentando...`, 'error');
            await updateLStateData({ 'lastOrder': null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[CONSOLIDATOR] ⚠️ Error: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidate };