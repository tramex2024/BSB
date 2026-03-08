// BSB/server/src/au/states/short/ShortSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../../services/bitmartService');
const { handleSuccessfulShortSell } = require('../../managers/shortDataManager'); 

/**
 * Monitorea órdenes de VENTA (apertura o DCA de Short).
 * Asegura que los BTC vendidos se registren correctamente en el 'sac'.
 */
async function monitorAndConsolidateShort(botState, SYMBOL, log, updateSStateData, updateBotState, updateGeneralBotState, userId, userCreds) {
    
    const lastOrder = botState.slastOrder;

    // Solo procesamos si hay una orden de VENTA pendiente
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);
    const creds = userCreds; 

    try {
        let finalDetails = await getOrderDetail(SYMBOL, orderIdString, creds);
        
        // 🟢 AUDITORÍA: Normalización robusta de la cantidad de BTC vendida
        let filledSize = parseFloat(
            finalDetails?.filledSize || 
            finalDetails?.filled_volume || 
            finalDetails?.size || 0
        );

        // 1. Back-up: Si la consulta es ambigua, revisamos historial
        if (!finalDetails || (isNaN(filledSize) && finalDetails.state !== 'new')) {
            const recentOrders = await getRecentOrders(SYMBOL, creds);
            finalDetails = recentOrders.find(o => String(o.orderId || o.order_id) === orderIdString);
            if (finalDetails) {
                filledSize = parseFloat(finalDetails.filledSize || finalDetails.size || 0);
            }
        }

        // 🟢 AUDITORÍA: Determinamos si la orden se completó o tiene ejecución parcial
        const isFilled = finalDetails?.state === 'filled' || finalDetails?.state === 'completed' || filledSize > 0;
        const isCanceled = finalDetails?.state === 'canceled' || finalDetails?.state === 'partially_canceled';

        // --- CASO 1: VENTA CONFIRMADA ---
        if (isFilled) {
            const currentOrderCount = (botState.socc || 0) + 1;
            
            // Si por algún motivo el exchange no devuelve el size pero la orden está filled, 
            // usamos el valor que el bot envió originalmente para no perder el rastro del BTC.
            const finalBtcExecuted = filledSize > 0 ? filledSize : parseFloat(lastOrder.btc_size || 0);

            log(`[S-CONSOLIDATOR] ✅ Venta confirmada (#${currentOrderCount}). BTC Vendidos: ${finalBtcExecuted.toFixed(6)}`, 'success');
            
            // Limpieza inmediata del slot para evitar duplicidad
            await updateGeneralBotState({ slastOrder: null });

            // Enviamos al DataManager para actualizar sppc (Precio Promedio) y sac (BTC acumulados)
            await handleSuccessfulShortSell(botState, { 
                ...finalDetails, 
                filledSize: finalBtcExecuted 
            }, log, { 
                updateGeneralBotState, 
                updateSStateData,
                userId 
            }); 
            
            return false; 
        }

        // --- CASO 2: ORDEN EN LIBRO ---
        if (finalDetails && ['new', 'partially_filled', '8'].includes(String(finalDetails.state))) {
            return true; // Bloqueamos nuevas acciones hasta que esta termine
        } 

        // --- CASO 3: CANCELADA ---
        if (isCanceled) {
            log(`[S-CONSOLIDATOR] ❌ Venta Short ${orderIdString} cancelada.`, 'error');
            await updateGeneralBotState({ 'slastOrder': null });
            return false;
        }

        return true;

    } catch (error) {
        log(`[S-CONSOLIDATOR] ⚠️ Error de red/API: ${error.message}`, 'error');
        return true; 
    }
}

module.exports = { monitorAndConsolidateShort };