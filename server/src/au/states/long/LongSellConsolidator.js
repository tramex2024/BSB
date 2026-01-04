// BSB/server/src/au/states/long/LongSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulSell } = require('../../managers/longDataManager');

/**
 * VIGILANCIA DE VENTA: Confirma el cierre del ciclo Long.
 */
async function monitorAndConsolidateSell(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState) {
    const lStateData = botState.lStateData;
    const lastOrder = lStateData.lastOrder;
    const LSTATE = 'long';

    // 1. FILTRO INICIAL: ¿Hay algo que monitorear?
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);
    log(`[L-SELL-MONITOR] 🔍 Verificando Take Profit ${orderIdString}...`, 'debug');

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        
        // Normalización de volumen (BitMart varía nombres de campos según el endpoint)
        let filledVolume = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.filledVolume || 0
        );

        // 2. RESPALDO: Si la consulta directa falla, buscamos en el historial reciente
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            log(`[L-SELL-MONITOR] ⚠️ Consulta directa fallida para ${orderIdString}. Revisando historial...`, 'info');
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
            }
        }

        // 3. DETERMINAR ESTADO DE LA ORDEN
        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // === CASO A: ÉXITO TOTAL O PARCIAL (Consolidar Beneficio) ===
        if (isFilled) {
            log(`💰 [L-SELL-SUCCESS] Venta confirmada (${filledVolume.toFixed(8)} BTC). Liquidando ciclo exponencial...`, 'success');
            
            const handlerDependencies = { 
                log, updateBotState, updateLStateData, updateGeneralBotState, 
                config: botState.config 
            };
            
            // Delegamos a LongDataManager para resetear el contador de órdenes a 0
            // y devolver el capital al balance disponible.
            await handleSuccessfulSell(botState, finalDetails, handlerDependencies);
            return true;
        }

        // === CASO B: LA ORDEN SIGUE EN LIBRO (Esperando compradores) ===
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            log(`⏳ [L-SELL-WAIT] Orden de venta aún activa. Precio actual cerca del objetivo.`, 'debug');
            return true; // Mantiene el bloqueo de lastOrder
        }

        // === CASO C: LA ORDEN FALLÓ O SE CANCELÓ SIN LLENARSE ===
        if (isCanceled && filledVolume === 0) {
            log(`❌ [L-SELL-FAIL] La venta se canceló sin ejecutarse. Liberando para reintento.`, 'error');
            await updateLStateData({ 'lastOrder': null });
            // Al limpiar lastOrder, LSelling.run volverá a intentar poner la orden en el próximo tick
            return true;
        }

        return true;

    } catch (error) {
        log(`[L-SELL-ERROR] Error crítico en consolidación: ${error.message}`, 'error');
        return true; // Bloqueo preventivo
    }
}

module.exports = { monitorAndConsolidateSell };