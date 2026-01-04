// BSB/server/src/au/states/long/LongSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulSell } = require('../../managers/longDataManager');

/**
 * VIGILANCIA DE VENTA: Confirma el cierre del ciclo Long.
 */
async function monitorAndConsolidateSell(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState) {
    const lStateData = botState.lStateData;
    const lastOrder = lStateData.lastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);

        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // === CASO A: ÉXITO TOTAL (Liquidando ciclo exponencial) ===
        if (isFilled) {
            log(`💰 [L-SELL-SUCCESS] Venta confirmada. Liquidando ciclo...`, 'success');
            
            // 🟢 DETECCIÓN DE STOP INDEPENDIENTE
            // Verificamos si en la config de Long se marcó "Stop at Cycle"
            const shouldStopAfterThis = botState.config?.long?.stopAtCycle === true;

            const handlerDependencies = { 
                log, 
                updateBotState, 
                updateLStateData, 
                updateGeneralBotState, 
                config: botState.config 
            };
            
            // 1. Ejecutamos la limpieza normal del ciclo (reset de ppc, ac, ai, etc.)
            await handleSuccessfulSell(botState, finalDetails, handlerDependencies);

            // 2. Si el stop estaba activo, sobreescribimos el estado a STOPPED
            if (shouldStopAfterThis) {
                log(`🛑 [L-STOP] Aplicando parada solicitada por usuario tras cierre de ciclo.`, 'warning');
                
                // Actualizamos ambos estados para asegurar que no reinicie
                await updateBotState('STOPPED', 'long'); 
                
                // También grabamos en la configuración que ya no está "enabled" para esta pierna
                // Esto es vital para que la UI refleje que el bot se apagó solo.
                await updateGeneralBotState({ 
                    'config.long.enabled': false,
                    'lstate': 'STOPPED' // Doble seguridad
                });
            }

            return true;
        }

        // === CASO B: LA ORDEN SIGUE EN LIBRO ===
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            return true; 
        }

        // === CASO C: FALLO O CANCELACIÓN ===
        if (isCanceled && filledVolume === 0) {
            log(`❌ [L-SELL-FAIL] Venta cancelada. Reintentando...`, 'error');
            await updateLStateData({ 'lastOrder': null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[L-SELL-ERROR] Error crítico: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateSell };