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
    const SSTATE = 'short';

    // 1. FILTRO: En Short, cerramos con una COMPRA (buy)
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);
    log(`[S-BUY-MONITOR] 🔍 Verificando recompra de cierre ${orderIdString}...`, 'debug');

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString);
        
        // Normalización de campos de BitMart
        let filledVolume = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.filledVolume || 0
        );

        // 2. BACKUP: Si la API no responde el detalle, buscar en el historial
        if (!finalDetails || (isNaN(filledVolume) && finalDetails.state !== 'new')) {
            log(`[S-BUY-MONITOR] ⚠️ Consulta directa fallida. Buscando en historial reciente...`, 'info');
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
            }
        }

        // 3. ESTADOS DE LA ORDEN
        const isFilled = finalDetails?.state === 'filled' || filledVolume > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // === CASO A: RECOMPRA EXITOSA (Cierre de Ciclo) ===
        if (isFilled) {
            log(`💰 [S-BUY-SUCCESS] Recompra confirmada (${filledVolume.toFixed(8)} BTC). Liquidando ciclo Short exponencial...`, 'success');
            
            const handlerDependencies = { 
                log, updateBotState, updateSStateData, updateGeneralBotState, 
                config: botState.config 
            };
            
            // ShortDataManager resetea el contador de órdenes y calcula la ganancia neta en USDT
            await handleSuccessfulShortBuy(botState, finalDetails, handlerDependencies);
            return true;
        }

        // === CASO B: ORDEN PENDIENTE (El precio aún no cae lo suficiente) ===
        if (finalDetails?.state === 'new' || finalDetails?.state === 'partially_filled') {
            log(`⏳ [S-BUY-WAIT] Orden de recompra activa. Esperando ejecución en el libro...`, 'debug');
            return true; // Mantiene el bloqueo del bot en este estado
        }

        // === CASO C: ORDEN FALLIDA SIN EJECUCIÓN ===
        if (isCanceled && filledVolume === 0) {
            log(`❌ [S-BUY-FAIL] La recompra falló o se canceló. Reintentando...`, 'error');
            await updateSStateData({ 'lastOrder': null });
            // Al limpiar lastOrder, el loop volverá a SBuying.run para intentar comprar de nuevo
            return true;
        }

        return true;

    } catch (error) {
        log(`[S-BUY-ERROR] Error crítico en consolidación Short: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShortBuy };