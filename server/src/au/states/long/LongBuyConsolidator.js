// BSB/server/src/au/states/long/LongBuyConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulBuy } = require('../../managers/longDataManager'); 

/**
 * CONSOLIDADOR DE COMPRA (LONG):
 * El "vigilante" que espera a que BitMart confirme la ejecución.
 * @param {userId} - Añadido para soporte multi-usuario.
 */
async function monitorAndConsolidate(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState, userId) {
    
    // 1. Verificación de existencia de orden
    const lastOrder = botState.llastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        // 2. CONSULTA AISLADA POR USUARIO
        // Pasamos userId para que bitmartService use las credenciales correctas
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString, userId);
        
        let filledVolume = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.filledVolume || 0
        );

        // --- LÓGICA DE RESPALDO POR USUARIO ---
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL, userId);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
            }
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // =================================================================
        // CASO 1: ÉXITO (La orden se llenó)
        // =================================================================
        if (isFilled) {
            log(`[CONSOLIDATOR] ✅ Compra confirmada: ${orderIdString}. Actualizando balances...`, 'success');
            
            // Inyectamos userId y los estados para el guardado en DB
            const dependencies = { 
                updateGeneralBotState, 
                updateLStateData,
                userId // <--- CRUCIAL PARA EL HISTORIAL
            };
            
            /**
             * Delegamos a handleSuccessfulBuy para procesar el ciclo exponencial.
             * Aquí es donde se llamará a orderPersistenceService.
             */
            await handleSuccessfulBuy(botState, finalDetails, log, dependencies);
            
            return true; 
        } 

        // =================================================================
        // CASO 2: ORDEN ACTIVA (Aún esperando)
        // =================================================================
        if (finalDetails && ['new', 'partially_filled'].includes(finalDetails.state)) {
            // Retornamos true para que LBuying sepa que hay una orden en curso
            return true; 
        } 

        // =================================================================
        // CASO 3: FALLO O CANCELACIÓN
        // =================================================================
        if (isCanceled && filledVolume === 0) {
            log(`[CONSOLIDATOR] ❌ Orden ${orderIdString} cancelada. Liberando slot.`, 'error');
            await updateGeneralBotState({ llastOrder: null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[CONSOLIDATOR] ⚠️ Error en monitoreo (User: ${userId}): ${error.message}`, 'warning');
        return true; 
    }
}

module.exports = { monitorAndConsolidate };