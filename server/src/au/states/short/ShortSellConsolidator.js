// BSB/server/src/au/states/short/ShortSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortSell } = require('../../managers/shortDataManager'); 

/**
 * Monitorea órdenes de VENTA (apertura o DCA de Short).
 * Confirma la ejecución y delega la actualización de métricas al ShortDataManager.
 */
async function monitorAndConsolidateShort(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState) {
    const sStateData = botState.sStateData;
    const lastOrder = sStateData?.lastOrder;

    // Si no hay orden o la orden es de COMPRA (buy), este consolidador no la maneja
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        
        // BitMart puede devolver el volumen en distintos campos según la versión de la API
        let filledVolume = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.filledVolume || 0
        );
        
        // 1. Verificación de respaldo (Back-up) si la API de detalle falla
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
            }
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // --- CASO 1: VENTA EXITOSA (Apertura o DCA) ---
        if (isFilled) {
            log(`[S-CONSOLIDATOR] ✅ Venta ${orderIdString} confirmada (${filledVolume} BTC).`, 'success');
            
            // 🟢 CRÍTICO: Aquí se recalculan el PPC, el AC y el siguiente paso Exponencial
            await handleSuccessfulShortSell(botState, finalDetails, log, { 
                updateGeneralBotState, 
                updateSStateData 
            }); 
            
            // Forzamos que se mantenga en SELLING para que SSelling.js busque el siguiente TP o DCA
            await updateBotState('SELLING', 'short'); 
            return false; // Liberamos el bloqueo de orden activa
        } 

        // --- CASO 2: ORDEN ACTIVA (Esperando en el libro) ---
        if (finalDetails && ['new', 'partially_filled'].includes(finalDetails.state)) {
            // Retornamos true para indicar que hay una orden bloqueando el ciclo
            return true; 
        } 

        // --- CASO 3: ORDEN CANCELADA O FALLIDA ---
        if (isCanceled && filledVolume === 0) {
            log(`[S-CONSOLIDATOR] ❌ Orden Short ${orderIdString} cancelada. Liberando...`, 'error');
            
            // Limpiamos la orden huérfana para que el bot pueda reintentar
            await updateSStateData({ 'lastOrder': null });
            await updateBotState('SELLING', 'short');
            return false;
        }

        // Por defecto, si el estado es desconocido, bloqueamos por seguridad
        return true;

    } catch (error) {
        log(`[S-CONSOLIDATOR] ⚠️ Error en consolidación: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShort };