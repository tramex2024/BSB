// BSB/server/src/au/states/long/LongBuyConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulBuy } = require('../../managers/longDataManager'); 

/**
 * CONSOLIDADOR DE COMPRA (LONG):
 * El "vigilante" que espera a que BitMart confirme que las monedas están en nuestra cuenta.
 */
async function monitorAndConsolidate(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState) {
    
    // ✅ MIGRADO: Referencia directa a la raíz (Estructura Plana)
    const lastOrder = botState.llastOrder;

    // Solo consolidamos si hay una orden y es de tipo 'buy' (Apertura o DCA)
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        
        // Extraemos el volumen lleno con soporte para múltiples formatos de respuesta de BitMart
        let filledVolume = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.filledVolume || 0
        );

        // --- LÓGICA DE RESPALDO ---
        // Si el detalle de la orden falla pero no es una orden "new", buscamos en el historial reciente
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL);
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
            log(`[CONSOLIDATOR] ✅ Compra confirmada: ${orderIdString}. Procesando datos exponenciales...`, 'success');
            
            const dependencies = { updateGeneralBotState, updateLStateData };
            
            /**
             * Delegamos a handleSuccessfulBuy para que:
             * 1. Actualice lac (Long Accumulated Coins)
             * 2. Actualice lppc (Long Price Per Coin)
             * 3. Recalcule lncp y ltprice (Lógica Exponencial)
             * 4. Limpie llastOrder
             */
            await handleSuccessfulBuy(botState, finalDetails, log, dependencies);
            
            return true; 
        } 

        // =================================================================
        // CASO 2: ORDEN ACTIVA (Aún en el libro de órdenes)
        // =================================================================
        if (finalDetails && ['new', 'partially_filled'].includes(finalDetails.state)) {
            // El bot simplemente retorna true para indicar que el estado actual (BUYING) 
            // sigue ocupado esperando esta orden.
            return true; 
        } 

        // =================================================================
        // CASO 3: FALLO O CANCELACIÓN MANUAL EN EXCHANGE
        // =================================================================
        if (isCanceled && filledVolume === 0) {
            log(`[CONSOLIDATOR] ❌ Orden ${orderIdString} cancelada o rechazada. Liberando raíz para reintento.`, 'error');
            
            // ✅ MIGRADO: Limpieza de la raíz para que LBuying.js pueda intentar colocar una nueva orden
            await updateGeneralBotState({ llastOrder: null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[CONSOLIDATOR] ⚠️ Error de red/API en monitoreo: ${error.message}. Reintentando en el próximo ciclo...`, 'warning');
        return true; // No bloqueamos, permitimos que el siguiente tick lo intente de nuevo
    }
}

module.exports = { monitorAndConsolidate };