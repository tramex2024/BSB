// BSB/server/src/au/states/short/ShortSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortSell } = require('../../managers/shortDataManager'); 

/**
 * Monitorea órdenes de VENTA (apertura o DCA de Short).
 * Confirma la ejecución y delega la actualización de métricas al ShortDataManager.
 */
async function monitorAndConsolidateShort(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState) {
    const sStateData = botState.sStateData;
    const lastOrder = sStateData.lastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);
        
        // Verificación de respaldo si la API no retorna datos inmediatos
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // --- CASO 1: VENTA EXITOSA (Entrada o Cobertura) ---
        if (isFilled) {
            log(`[S-CONSOLIDATOR] ✅ Venta ${orderIdString} confirmada.`, 'success');
            
            // Delegamos el recálculo de PPC y limpieza de 'lastOrder' al Manager
            await handleSuccessfulShortSell(botState, finalDetails, log, { updateGeneralBotState, updateSStateData }); 
            
            // Mantenemos el estado en SELLING para que el motor siga gestionando la posición
            await updateBotState('SELLING', 'short'); 
            return true; 
        } 

        // --- CASO 2: ORDEN ACTIVA ---
        if (finalDetails && ['new', 'partially_filled'].includes(finalDetails.state)) {
            return true; 
        } 

        // --- CASO 3: ORDEN CANCELADA O FALLIDA ---
        if (isCanceled && filledVolume === 0) {
            log(`[S-CONSOLIDATOR] ❌ Orden Short ${orderIdString} cancelada sin ejecución.`, 'error');
            
            // Liberamos el lastOrder para que el bot pueda intentar vender de nuevo
            await updateSStateData({ 'lastOrder': null });
            await updateBotState('SELLING', 'short');
            return true;
        }

        return true;

    } catch (error) {
        log(`[S-CONSOLIDATOR] ⚠️ Error crítico: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShort };