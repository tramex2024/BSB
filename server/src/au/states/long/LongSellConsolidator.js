// BSB/server/src/au/states/long/LongSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulSell } = require('../../managers/longDataManager');
// 🟢 CORRECCIÓN: Importación necesaria para que el historial (tradecycles) funcione
const { logSuccessfulCycle } = require('../../../../services/cycleLogService'); 

/**
 * VIGILANCIA DE VENTA: Confirma el cierre del ciclo Long.
 * Delega la lógica de parada o reinicio al LongDataManager.
 */
async function monitorAndConsolidateSell(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState) {
    
    // ✅ CAMBIO: Ahora leemos la orden directamente de la raíz (llastOrder)
    const lastOrder = botState.llastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);

        // Respaldo Atómico: Verificación en historial si falla la consulta directa
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // === CASO A: VENTA CONFIRMADA (Delegación al Manager) ===
        if (isFilled) {
            log(`💰 [L-SELL-SUCCESS] Venta confirmada. Procesando cierre de ciclo...`, 'success');
            
            const handlerDependencies = { 
                log, 
                updateBotState, 
                updateLStateData, 
                updateGeneralBotState, 
                logSuccessfulCycle, // Inyectamos la función para asegurar el registro en tradecycles
                config: botState.config // Contiene la nueva jerarquía config.long
            };
            
            // ✅ handleSuccessfulSell se encargará de resetear las siglas de raíz (lac, lai, etc.)
            await handleSuccessfulSell(botState, finalDetails, handlerDependencies);

            return true;
        }

        // === CASO B: LA ORDEN SIGUE EN EL LIBRO ===
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            return true; 
        }

        // === CASO C: FALLO O CANCELACIÓN SIN EJECUCIÓN ===
        if (isCanceled && filledVolume === 0) {
            log(`❌ [L-SELL-FAIL] Venta cancelada sin ejecución. Liberando para reintento...`, 'error');
            
            // ✅ CAMBIO: Limpiamos llastOrder en la raíz
            await updateGeneralBotState({ llastOrder: null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[L-SELL-ERROR] Error crítico: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateSell };