// BSB/server/src/au/states/short/ShortSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortSell } = require('../../managers/shortDataManager'); 

/**
 * Monitorea órdenes de VENTA (apertura o DCA de Short).
 * Asegura que los activos vendidos se registren correctamente en el 'sac' del usuario.
 */
async function monitorAndConsolidateShort(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState, userId) {
    // Referencia directa al slot de órdenes pendientes del Short
    const lastOrder = botState.slastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        // Consultamos BitMart usando el contexto del usuario específico (API Keys aisladas)
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString, userId);
        
        // Normalización de tamaño ejecutado (BTC vendidos para el Short)
        let filledSize = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.size || 0
        );

        // 1. Back-up: Si la consulta directa es ambigua, revisamos el historial reciente del usuario
        if (!finalDetails || (isNaN(filledSize) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL, userId);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) {
                filledSize = parseFloat(finalDetails.filledSize || finalDetails.size || 0);
            }
        }

        const isFilled = finalDetails?.state === 'filled' || finalDetails?.state === 'completed' || filledSize > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // --- CASO 1: VENTA CONFIRMADA (Apertura o DCA Short) ---
        if (isFilled) {
            const currentOrderCount = (botState.socc || 0) + 1;
            log(`[S-CONSOLIDATOR] ✅ Venta confirmada (#${currentOrderCount}). Actualizando posición Short...`, 'success');
            
            // Limpieza inmediata del slot para evitar bucles de consolidación
            await updateGeneralBotState({ slastOrder: null });

            // El manager se encargará de saveExecutedOrder y recalcular el PPC de venta (sppc)
            await handleSuccessfulShortSell(botState, { ...finalDetails, filledSize: filledSize || lastOrder.btc_size }, log, { 
                updateGeneralBotState, 
                updateSStateData,
                userId 
            }); 
            
            return false; // Indica que la orden ya no está activa
        }

        // --- CASO 2: ORDEN EN LIBRO (Esperando ejecución) ---
        // Se mantiene el retorno en true para bloquear nuevas órdenes mientras esta exista
        if (finalDetails && ['new', 'partially_filled', '8'].includes(String(finalDetails.state))) {
            return true; 
        } 

        // --- CASO 3: ORDEN CANCELADA O FALLIDA ---
        if (isCanceled) {
            log(`[S-CONSOLIDATOR] ❌ Orden Short ${orderIdString} cancelada. Liberando para reintento manual o automático.`, 'error');
            await updateGeneralBotState({ 'slastOrder': null });
            return false;
        }

        return true;

    } catch (error) {
        log(`[S-CONSOLIDATOR] ⚠️ Error crítico de monitoreo: ${error.message}`, 'error');
        // No limpiamos el lastOrder aquí para permitir reintento de consulta en el siguiente tick
        return true; 
    }
}

module.exports = { monitorAndConsolidateShort };