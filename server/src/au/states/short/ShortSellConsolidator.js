// BSB/server/src/au/states/short/ShortSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortSell } = require('../../managers/shortDataManager'); 

/**
 * Monitorea órdenes de VENTA (apertura/cobertura de Short) y consolida la posición.
 */
async function monitorAndConsolidateShort(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState) {
    const sStateData = botState.sStateData;
    const lastOrder = sStateData.lastOrder;

    // Salida rápida si no hay nada que monitorear
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);
    log(`[S-CONSOLIDATOR] 🔍 Verificando venta Short ${orderIdString}...`, 'warning');

    try {
        let orderDetails = await getOrderDetail(SYMBOL, orderIdString);
        let finalDetails = orderDetails;
        
        // Normalización de volumen llenado
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);
        
        let isOrderProcessed = (
            ['filled', 'partially_canceled', 'canceled'].includes(finalDetails?.state) || 
            filledVolume > 0
        );

        // Respaldo: Buscar en historial si la consulta directa falla
        if (!isOrderProcessed) {
            const recentOrders = await getRecentOrders(SYMBOL);
            finalDetails = recentOrders.find(order => 
                String(order.orderId) === orderIdString || String(order.order_id) === orderIdString
            );
            
            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || finalDetails.filled_volume || 0);
                isOrderProcessed = filledVolume > 0;
            }
        }

        // --- CASO 1: VENTA EXITOSA (Apertura o DCA del Short) ---
        if (isOrderProcessed && filledVolume > 0) {
            log(`[S-CONSOLIDATOR] ✅ Venta ${orderIdString} confirmada. Actualizando PPC de Short...`, 'success');
            
            // Pasamos las dependencias para que use la "Caja de Cambios" interna
            await handleSuccessfulShortSell(botState, finalDetails, log, { updateGeneralBotState, updateSStateData }); 
            
            await updateBotState('SELLING', 'short'); 
            return true; 
        } 

        // --- CASO 2: ORDEN AÚN ACTIVA EN BITMART ---
        if (finalDetails && ['new', 'partially_filled'].includes(finalDetails.state)) {
            log(`[S-CONSOLIDATOR] ⏳ Orden Short ${orderIdString} sigue abierta en libro (${finalDetails.state}).`, 'info');
            return true; 
        } 

        // --- CASO 3: ORDEN FALLIDA / CANCELADA ---
        log(`[S-CONSOLIDATOR] ❌ Orden Short ${orderIdString} no se ejecutó. Liberando bloqueo.`, 'error');
        
        await updateSStateData({ 'lastOrder': null });
        await updateBotState('SELLING', 'short');
        
        return true;

    } catch (error) {
        log(`[S-CONSOLIDATOR] ⚠️ Error de conexión al verificar orden Short: ${error.message}`, 'error');
        // Bloqueamos el estado por seguridad hasta la siguiente vuelta
        return true; 
    }
}

module.exports = { monitorAndConsolidateShort };