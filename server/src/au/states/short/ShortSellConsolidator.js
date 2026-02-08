// BSB/server/src/au/states/short/ShortSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortSell } = require('../../managers/shortDataManager'); 

/**
 * Monitorea órdenes de VENTA (apertura o DCA de Short).
 * @param {string} userId - Identificador del usuario para contexto de API y DB.
 */
async function monitorAndConsolidateShort(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState, userId) {
    // Leemos directamente de la raíz slastOrder
    const lastOrder = botState.slastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        // Consultamos BitMart usando el contexto del usuario específico (API Keys)
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString, userId);
        
        // Aseguramos capturar el tamaño ejecutado (BTC vendidos)
        let filledSize = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.size || 0
        );

        // 1. Verificación de respaldo (Back-up) si la API falla
        if (!finalDetails || (isNaN(filledSize) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL, userId);
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

            log(`[S-CONSOLIDATOR] ✅ Venta confirmada (#${(botState.socc || 0) + 1}). Consolidando en DB...`, 'success');
            
            // 🔥 PASO CLAVE: Limpiamos slastOrder inmediatamente en el documento del usuario
            await updateGeneralBotState({ slastOrder: null });

            // El manager se encargará de saveExecutedOrder(..., userId)
            await handleSuccessfulShortSell(botState, { ...finalDetails, filledSize: finalExecutedQty }, log, { 
                updateGeneralBotState, 
                updateSStateData,
                userId // <--- INYECTAMOS LA IDENTIDAD
            }); 
            
            return false; 
        }

        // --- CASO 2: ORDEN ACTIVA (Esperando en el libro) ---
        if (finalDetails && ['new', 'partially_filled', '8'].includes(String(finalDetails.state))) {
            return true; // Mantiene el bloqueo del estado para evitar duplicidad
        } 

        // --- CASO 3: ORDEN CANCELADA ---
        if (isCanceled) {
            log(`[S-CONSOLIDATOR] ❌ Orden Short ${orderIdString} cancelada. Liberando para reintento.`, 'error');
            await updateGeneralBotState({ 'slastOrder': null });
            return false;
        }

        return true;

    } catch (error) {
        log(`[S-CONSOLIDATOR] ⚠️ Error en consolidación: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShort };