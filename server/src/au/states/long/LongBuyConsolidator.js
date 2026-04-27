// BSB/server/src/au/states/long/LongBuyConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulBuy } = require('../../managers/longDataManager'); 

/**
 * CONSOLIDADOR DE COMPRA (LONG):
 * El "vigilante" que espera a que BitMart confirme la ejecución.
 * @param {userId} - Añadido para soporte multi-usuario.
 */
async function monitorAndConsolidate(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState, userId, userCreds) { 
    
    // 1. Verificación de existencia de orden
    const lastOrder = botState.llastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);

    // 🟢 AUDITORÍA: Usamos las credenciales inyectadas, no las de botState.config
    const creds = userCreds; 

    try {
        // 2. CONSULTA AISLADA POR USUARIO
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString, creds);
        
        // CORRECCIÓN: BitMart V4 usa filled_size para el volumen ejecutado
        let filledVolume = parseFloat(
            finalDetails?.filled_size ||   // <--- Agregar este (API V4)
            finalDetails?.filledSize ||    // (API V2/V4 fallback)
            finalDetails?.filled_volume || // (Websocket/Historial)
            0
        );

        // Si la orden está 'filled', pero el objeto no tiene el campo 'size' normalizado, 
        // lo inyectamos para que saveExecutedOrder lo encuentre.
        if (finalDetails && !finalDetails.size && filledVolume > 0) {
            finalDetails.size = filledVolume;
        }
        
        // Lo mismo para el precio promedio si viene como price_avg o priceAvg
        if (finalDetails && !finalDetails.priceAvg) {
            finalDetails.priceAvg = finalDetails.price_avg || finalDetails.avg_price || 0;
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // =================================================================
        // CASO 1: ÉXITO (La orden se llenó)
        // =================================================================
        if (isFilled) {
            log(`[CONSOLIDATOR] ✅ Compra confirmada: ${orderIdString}. Actualizando balances...`, 'success');
            
            const dependencies = { 
                updateGeneralBotState, 
                updateLStateData,
                userId 
            };
            
            await handleSuccessfulBuy(botState, finalDetails, log, dependencies);
            
            return true; 
        } 

        // =================================================================
        // CASO 2: ORDEN ACTIVA (Aún esperando)
        // =================================================================
        if (finalDetails && ['new', 'partially_filled'].includes(finalDetails.state)) {
            return true; 
        } 

        // =================================================================
        // CASO 3: FALLO O CANCELACIÓN
        // =================================================================
        if (isCanceled && filledVolume === 0) {
            log(`[CONSOLIDATOR] ❌ Orden ${orderIdString} cancelada. Liberando slot.`, 'error');
            await updateGeneralBotState({ llastOrder: null });
            return false; // <--- CAMBIO ACORDADO
        }

        // Si llegó aquí y no hay un estado claro de 'new' o 'filled'
        return false; // <--- CAMBIO ACORDADO

    } catch (error) {
        log(`[CONSOLIDATOR] ⚠️ Error en monitoreo (User: ${userId}): ${error.message}`, 'warning');
        return false; // <--- CAMBIO ACORDADO
    }
}

module.exports = { monitorAndConsolidate };