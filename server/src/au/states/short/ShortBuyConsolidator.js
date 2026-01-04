// BSB/server/src/au/states/short/ShortBuyConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortBuy } = require('../../managers/shortDataManager');

/**
 * CONSOLIDADOR DE RECOMPRA (SHORT): 
 * Verifica el cierre del ciclo cuando el precio baja al Take Profit.
 */
async function monitorAndConsolidateShortBuy(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState) {
    const sStateData = botState.sStateData;
    const lastOrder = sStateData.lastOrder;

    // 1. FILTRO: En Short, cerramos con una COMPRA (buy)
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        
        let filledVolume = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.filledVolume || 0
        );

        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
            }
        }

        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // === CASO A: RECOMPRA EXITOSA (Cierre de Ciclo Short) ===
        if (isFilled) {
            log(`💰 [S-BUY-SUCCESS] Recompra confirmada. Liquidando ciclo Short exponencial...`, 'success');
            
            // 🟢 DETECCIÓN DE STOP INDEPENDIENTE PARA SHORT
            const shouldStopAfterThis = botState.config?.short?.stopAtCycle === true;

            const handlerDependencies = { 
                log, 
                updateBotState, 
                updateSStateData, 
                updateGeneralBotState, 
                config: botState.config 
            };
            
            // 1. Reseteamos balances y contadores de Short
            await handleSuccessfulShortBuy(botState, finalDetails, handlerDependencies);

            // 2. Aplicamos parada si está configurada
            if (shouldStopAfterThis) {
                log(`🛑 [S-STOP] Deteniendo estrategia Short tras completar ciclo.`, 'warning');
                
                await updateBotState('STOPPED', 'short');
                
                // Persistimos el apagado en la configuración raíz
                await updateGeneralBotState({ 
                    'config.short.enabled': false,
                    'sstate': 'STOPPED' 
                });
            }

            return true;
        }

        // === CASO B: ORDEN PENDIENTE ===
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            return true; 
        }

        // === CASO C: ORDEN FALLIDA ===
        if (isCanceled && filledVolume === 0) {
            log(`❌ [S-BUY-FAIL] Recompra cancelada. Reintentando...`, 'error');
            await updateSStateData({ 'lastOrder': null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[S-BUY-ERROR] Error crítico en consolidación Short: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShortBuy };