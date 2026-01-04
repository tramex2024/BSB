// BSB/server/src/au/states/long/LongBuyConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulBuy } = require('../../managers/longDataManager'); 

/**
 * Monitorea órdenes de compra y consolida la posición.
 */
async function monitorAndConsolidate(botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState) {
    const lStateData = botState.lStateData;
    const lastOrder = lStateData.lastOrder;

    // Si no hay orden pendiente, salimos rápido
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);
    log(`[CONSOLIDATOR] 🔍 Verificando orden de compra ${orderIdString}...`, 'warning');

    try {
        let orderDetails = await getOrderDetail(SYMBOL, orderIdString);
        let finalDetails = orderDetails;
        
        // Normalización de volumen (BitMart usa distintos nombres según la versión de API)
        let filledVolume = parseFloat(finalDetails?.filledSize || finalDetails?.filled_volume || finalDetails?.filledVolume || 0);
        
        let isOrderProcessed = (
            ['filled', 'partially_canceled', 'canceled'].includes(finalDetails?.state) || 
            filledVolume > 0
        );

        // Lógica de Respaldo: Si la consulta directa no da resultado claro, buscamos en historial
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

        // --- CASO 1: ORDEN COMPLETADA O CON EJECUCIÓN PARCIAL ---
        if (isOrderProcessed && filledVolume > 0) {
            log(`[CONSOLIDATOR] ✅ Orden ${orderIdString} procesada. Actualizando PPC y AC...`, 'success');
            
            // IMPORTANTE: handleSuccessfulBuy debe recibir los "updates" si los necesita internamente.
            // Esta función recalcula el PPC (tus $90,556.01) y limpia el lastOrder.
            await handleSuccessfulBuy(botState, finalDetails, log); 
            
            // Forzamos un refresco de estado para asegurar que el bot vea los nuevos targets inmediatamente
            await updateBotState('BUYING', 'long'); 
            return true; 
        } 

        // --- CASO 2: ORDEN TODAVÍA ACTIVA EN EL EXCHANGE ---
        if (finalDetails && ['new', 'partially_filled'].includes(finalDetails.state)) {
            log(`[CONSOLIDATOR] ⏳ Orden ${orderIdString} sigue abierta (${finalDetails.state}).`, 'info');
            return true; 
        } 

        // --- CASO 3: ORDEN CANCELADA O FALLIDA SIN LLENAR NADA ---
        log(`[CONSOLIDATOR] ❌ Orden ${orderIdString} falló o fue cancelada sin ejecución.`, 'error');
        
        // Limpiamos la orden para que el bot pueda intentar una nueva compra
        await updateLStateData({ 'lastOrder': null });
        await updateBotState('BUYING', 'long');
        
        return true;

    } catch (error) {
        log(`[CONSOLIDATOR] ⚠️ Error consultando orden ${orderIdString}: ${error.message}`, 'error');
        // Retornamos true para "bloquear" nuevas compras hasta que la conexión se estabilice
        return true; 
    }
}

module.exports = { monitorAndConsolidate };