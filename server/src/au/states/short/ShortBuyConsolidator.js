// BSB/server/src/au/states/short/ShortBuyConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortBuy } = require('../../managers/shortDataManager');

/**
 * CONSOLIDADOR DE RECOMPRA (SHORT): 
 * Confirma el cierre del ciclo cuando se ejecuta el Take Profit (Buy).
 * Delega la lógica de reinicio exponencial o parada al ShortDataManager.
 */
async function monitorAndConsolidateShortBuy(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState) {
    const sStateData = botState.sStateData;
    const lastOrder = sStateData.lastOrder;

    // En Short, el ciclo se cierra con una compra (buy) para cubrir la venta previa
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);

        // Verificación de respaldo en historial
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // === CASO A: RECOMPRA EXITOSA (Take Profit) ===
        if (isFilled) {
            log(`💰 [S-BUY-SUCCESS] Recompra confirmada. Finalizando ciclo Short...`, 'success');
            
            const handlerDependencies = { 
                log, 
                updateBotState, 
                updateSStateData, 
                updateGeneralBotState, 
                config: botState.config 
            };
            
            // Centralizamos la decisión: ¿Ir a SELLING (Exponencial) o a STOPPED?
            // Esta lógica ya está blindada dentro del ShortDataManager que corregimos.
            await handleSuccessfulShortBuy(botState, finalDetails, handlerDependencies);

            return true;
        }

        // === CASO B: ORDEN PENDIENTE EN LIBRO ===
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            return true; 
        }

        // === CASO C: ORDEN FALLIDA O CANCELADA ===
        if (isCanceled && filledVolume === 0) {
            log(`❌ [S-BUY-FAIL] Recompra cancelada sin ejecución. Reintentando...`, 'error');
            await updateSStateData({ 'lastOrder': null });
            // El bot volverá a intentar poner la compra de cierre en el próximo ciclo
            return true;
        }

        return true;

    } catch (error) {
        log(`[S-BUY-ERROR] Error en consolidación Short Buy: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShortBuy };