/**
 * BSB/server/src/states/short/ShortSellConsolidator.js
 * SHORT SELL CONSOLIDATOR:
 * Monitorea órdenes de VENTA (Apertura o DCA Short).
 * Asegura que los activos vendidos se registren correctamente en el 'sac' (Short Average Cost) del usuario.
 * Protegido contra ejecuciones parciales, desconexiones temporales de red/DNS y latencia de API BitMart (2026).
 */

const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService');
const { handleSuccessfulShortSell } = require('../../managers/shortDataManager'); 
const { TRADE_SYMBOL } = require('../../../utils/tradeConstants');

/**
 * Helper estandarizado para detectar errores temporales de red, timeout o DNS
 */
const isNetworkError = (err) => {
    const msg = err?.message || '';
    const code = err?.code || '';
    return code === 'ENOTFOUND' || 
           code === 'ETIMEDOUT' || 
           code === 'ECONNRESET' || 
           msg.includes('ENOTFOUND') || 
           msg.includes('Request Failed') ||
           msg.includes('Network') ||
           msg.includes('socket hang up');
};

/**
 * Monitorea y consolida ejecuciones de Venta (Short Opening / Short DCA).
 * 
 * @param {Object} botState - Estado actual del bot
 * @param {string} SYMBOL - Par de trading
 * @param {Function} log - Logger del sistema
 * @param {Function} updateSStateData - Actualizador de estado Short
 * @param {Function} updateBotState - Actualizador de memoria del bot
 * @param {Function} updateGeneralBotState - Actualizador raíz de MongoDB/memoria
 * @param {string} userId - ID del usuario
 * @param {Object} userCreds - Credenciales API de BitMart
 * @returns {Promise<boolean>} true = orden pendiente o bloqueo activo; false = slot libre/procesado
 */
async function monitorAndConsolidateShort(
    botState, 
    SYMBOL = TRADE_SYMBOL, 
    log, 
    updateSStateData, 
    updateBotState, 
    updateGeneralBotState, 
    userId, 
    userCreds
) {
    const lastOrder = botState.slastOrder;

    // 1. Si no hay orden para monitorear o no es una venta, liberamos el bloqueo (false)
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);
    const creds = userCreds; 
    const effectiveSymbol = String(SYMBOL || TRADE_SYMBOL);

    try {
        // 2. Consulta de detalles de la orden en BitMart
        let finalDetails = await getOrderDetail(effectiveSymbol, orderIdString, creds);
        
        let filledSize = parseFloat(
            finalDetails?.filled_size ||    // BitMart API V4
            finalDetails?.filledSize ||     // BitMart API V2
            finalDetails?.filled_volume ||  // Websocket/History
            finalDetails?.size || 
            0
        );

        const rawState = String(finalDetails?.state || finalDetails?.status || '').toLowerCase();

        // Fallback: Si no hay detalles directos o el volumen es ambiguo en estado inactivo
        if (!finalDetails || (isNaN(filledSize) && rawState !== 'new' && rawState !== 'partially_filled')) {
            try {
                const recentOrders = await getRecentOrders(effectiveSymbol, creds);
                const matchedOrder = recentOrders?.find(o => String(o.orderId || o.order_id) === orderIdString);
                
                if (matchedOrder) {
                    finalDetails = matchedOrder;
                    filledSize = parseFloat(
                        finalDetails.filled_size || 
                        finalDetails.filledSize || 
                        finalDetails.size || 
                        0
                    );
                }
            } catch (historyErr) {
                // Se ignora el fallo del historial y se procede con la información disponible
            }
        }

        // Normalización previa para el manager de datos Short
        if (finalDetails) {
            if (!finalDetails.size && filledSize > 0) {
                finalDetails.size = filledSize;
            }
            if (!finalDetails.priceAvg) {
                finalDetails.priceAvg = parseFloat(
                    finalDetails.price_avg || 
                    finalDetails.avg_price || 
                    finalDetails.price || 
                    0
                );
            }
        }

        const currentState = String(finalDetails?.state || finalDetails?.status || '').toLowerCase();

        // 3. Evaluación de estados de la orden
        const isFullyFilled = currentState === 'filled' || currentState === 'completed';
        const isCanceled = currentState === 'canceled' || currentState === 'partially_canceled';

        // Solo se consolida si la orden está 100% completada O cancelada habiendo ejecutado una parte
        const isReadyToConsolidate = isFullyFilled || (isCanceled && filledSize > 0);

        // =================================================================
        // CASO 1: VENTA CONFIRMADA (Apertura o DCA Short exitoso)
        // =================================================================
        if (isReadyToConsolidate) {
            const currentOrderCount = (botState.socc || 0) + 1;
            log(`[S-CONSOLIDATOR] ✅ Venta confirmada (#${currentOrderCount}). Actualizando posición Short...`, 'success');
            
            // Limpieza inmediata del slot para evitar bucles de consolidación
            await updateGeneralBotState({ slastOrder: null });

            await handleSuccessfulShortSell(
                botState, 
                { ...finalDetails, filledSize: filledSize || lastOrder.btc_size }, 
                log, 
                { 
                    updateGeneralBotState, 
                    updateSStateData,
                    userId 
                }
            ); 
            
            return false; // Bloqueo liberado: orden procesada correctamente
        }

        // =================================================================
        // CASO 2: ORDEN EN LIBRO (Esperando ejecución)
        // =================================================================
        if (!finalDetails || ['new', 'partially_filled', '8'].includes(currentState)) {
            return true; // Mantiene el bloqueo activo
        } 

        // =================================================================
        // CASO 3: ORDEN CANCELADA SIN EJECUCIÓN (Volumen 0)
        // =================================================================
        if (isCanceled && filledSize === 0) {
            log(`[S-CONSOLIDATOR] ❌ Orden Short ${orderIdString} cancelada sin ejecuciones. Liberando para reintentar.`, 'warning');
            await updateGeneralBotState({ slastOrder: null });
            return false; // Bloqueo liberado: la orden ya no existe
        }

        return true;

    } catch (error) {
        log(`[S-CONSOLIDATOR] ⚠️ Error de monitoreo (User: ${userId}): ${error.message}`, 'error');
        // Se retorna true para mantener el bloqueo y evitar órdenes duplicadas en caída de red/API
        return true; 
    }
}

module.exports = { monitorAndConsolidateShort };