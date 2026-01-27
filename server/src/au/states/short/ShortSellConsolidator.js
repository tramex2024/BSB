// BSB/server/src/au/states/short/ShortSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortSell } = require('../../managers/shortDataManager'); 

/**
 * Monitorea órdenes de VENTA (apertura o DCA de Short).
 */
async function monitorAndConsolidateShort(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState) {
    // ✅ CAMBIO DE PARÁMETRO: Referencia a raíz slastOrder
    const lastOrder = botState.slastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        
        // Aseguramos capturar el tamaño ejecutado (BTC vendidos)
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

        const isFilled = finalDetails?.state === 'filled' || (finalDetails?.state === 'completed') || filledSize > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // --- CASO 1: VENTA EXITOSA (Apertura o Cobertura) ---
        if (isFilled) {
    const finalExecutedQty = filledSize > 0 ? filledSize : (lastOrder.btc_size || 0);

    log(`[S-CONSOLIDATOR] ✅ Venta confirmada. Consolidando...`, 'success');
    
    // 🔥 PASO CLAVE: Limpiamos slastOrder ANTES para que ninguna otra vuelta del bucle entre aquí.
    await updateGeneralBotState({ slastOrder: null });

    await handleSuccessfulShortSell(botState, { ...finalDetails, filledSize: finalExecutedQty }, log, { 
        updateGeneralBotState, 
        updateSStateData 
    }); 
    
    return false; 
}

        // --- CASO 2: ORDEN ACTIVA (Esperando en el libro) ---
        if (finalDetails && ['new', 'partially_filled', '8'].includes(String(finalDetails.state))) {
            return true; // Mantiene el bloqueo en SSelling
        } 

        // --- CASO 3: ORDEN CANCELADA ---
        if (isCanceled) {
            log(`[S-CONSOLIDATOR] ❌ Orden Short ${orderIdString} cancelada sin ejecutarse. Liberando estado.`, 'error');
            // ✅ CAMBIO DE PARÁMETRO: Limpieza de slastOrder en raíz
            await updateSStateData({ 'slastOrder': null });
            return false;
        }

        return true;

    } catch (error) {
        log(`[S-CONSOLIDATOR] ⚠️ Error en consolidación: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShort };