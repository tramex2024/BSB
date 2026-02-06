// BSB/server/src/au/states/short/ShortSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortSell } = require('../../managers/shortDataManager'); 

/**
 * Monitorea órdenes de VENTA (apertura o DCA de Short).
 */
async function monitorAndConsolidateShort(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState) {
    const sStateData = botState.sStateData;
    const lastOrder = sStateData?.lastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        
        // 🟢 MEJORA: BitMart V2/V4 usa campos distintos. Aseguramos capturar el tamaño ejecutado.
        let filledSize = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.size || 0
        );

        // 1. Verificación de respaldo (Back-up)
        if (!finalDetails || (isNaN(filledSize) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) {
                filledSize = parseFloat(finalDetails.filledSize || finalDetails.size || 0);
            }
        }

        // En BitMart, una orden market suele pasar a 'filled' casi instantáneamente
        const isFilled = finalDetails?.state === 'filled' || (finalDetails?.state === 'completed') || filledSize > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // --- CASO 1: VENTA EXITOSA ---
        if (isFilled) {
            // Si la API no nos dio el size pero sabemos que es filled, usamos el del lastOrder como fallback
            const finalExecutedQty = filledSize > 0 ? filledSize : (lastOrder.btc_size || 0);

            log(`[S-CONSOLIDATOR] ✅ Venta ${orderIdString} confirmada (${finalExecutedQty} BTC).`, 'success');
            
            // 🟢 Inyectamos el detalle procesado al DataManager
            await handleSuccessfulShortSell(botState, { ...finalDetails, filledSize: finalExecutedQty }, log, { 
                updateGeneralBotState, 
                updateSStateData 
            }); 
            
            // Importante: retornamos false para que el bucle de SSelling.js continúe
            return false; 
        } 

        // --- CASO 2: ORDEN ACTIVA ---
        if (finalDetails && ['new', 'partially_filled', '8'].includes(String(finalDetails.state))) {
            return true; // Bloquea hasta que se llene
        } 

        // --- CASO 3: ORDEN CANCELADA ---
        if (isCanceled) {
            log(`[S-CONSOLIDATOR] ❌ Orden Short ${orderIdString} cancelada sin ejecutarse.`, 'error');
            await updateSStateData({ 'lastOrder': null });
            return false;
        }

        return true;

    } catch (error) {
        log(`[S-CONSOLIDATOR] ⚠️ Error en consolidación: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShort };