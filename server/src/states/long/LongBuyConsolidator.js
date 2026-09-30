/**
 * BSB/server/src/states/long/LongBuyConsolidator.js
 * BUY CONSOLIDATOR (LONG):
 * El "watchdog" que verifica la confirmación de ejecución de órdenes de compra en BitMart.
 * Protegido contra desconexiones temporales de red/DNS, latencia API y parcialmente llenados (2026).
 */

const { getOrderDetail } = require('../../../services/bitmartService');
const { handleSuccessfulBuy } = require('../../managers/longDataManager'); 
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
 * Monitorea y consolida órdenes de compra Long activas en BitMart.
 * 
 * @param {Object} botState - Estado actual del bot
 * @param {string} SYMBOL - Par de trading (ej. BMX_USDT)
 * @param {Function} log - Logger del sistema
 * @param {Function} updateLStateData - Actualizador de sub-estado Long
 * @param {Function} updateBotState - Actualizador genérico del bot
 * @param {Function} updateGeneralBotState - Actualizador raíz de MongoDB/memoria
 * @param {string} userId - ID del usuario para arquitectura multi-cuenta
 * @param {Object} userCreds - Credenciales API de BitMart
 * @returns {Promise<boolean>} true = orden activa o procesada con éxito; false = slot liberado / libre
 */
async function monitorAndConsolidate(
    botState, 
    SYMBOL = TRADE_SYMBOL, 
    log, 
    updateLStateData, 
    updateBotState, 
    updateGeneralBotState, 
    userId, 
    userCreds
) {    
    // 1. Verificación de existencia de la orden en memoria
    const lastOrder = botState.llastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);
    const creds = userCreds; 

    try {
        // 2. Consulta aislada de detalles de orden por credenciales de usuario
        const finalDetails = await getOrderDetail(SYMBOL, orderIdString, creds);
        
        // Normalización de volumen ejecutado (Soporte BitMart V2/V4/Websocket)
        const filledVolume = parseFloat(
            finalDetails?.filled_size ||    // BitMart API V4
            finalDetails?.filledSize ||     // BitMart API V2
            finalDetails?.filled_volume ||  // Fallback WS/Historial
            finalDetails?.size ||
            0
        );

        // Inyección de compatibilidad para saveExecutedOrder / handleSuccessfulBuy
        if (finalDetails) {
            if (!finalDetails.size && filledVolume > 0) {
                finalDetails.size = filledVolume;
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

        const rawState = (finalDetails?.state || finalDetails?.status || '').toLowerCase();

        // 3. Evaluación rigurosa de estados
        const isFullyFilled = rawState === 'filled';
        const isCanceled = rawState === 'canceled' || rawState === 'partially_canceled';
        
        // Solo consolidamos si está 100% llena O si fue cancelada habiendo ejecutado una parte
        const isReadyToConsolidate = isFullyFilled || (isCanceled && filledVolume > 0);

        // =================================================================
        // CASO 1: ÉXITO (Orden ejecutada totalmente o parcial cancelada)
        // =================================================================
        if (isReadyToConsolidate) {
            log(`[CONSOLIDATOR LONG BUY] ✅ Orden confirmada: ${orderIdString} (Vol: ${filledVolume}). Consolidando posición...`, 'success');
            
            const dependencies = { 
                updateGeneralBotState, 
                updateLStateData,
                updateBotState,
                userId 
            };
            
            await handleSuccessfulBuy(botState, finalDetails, log, dependencies);
            return true; 
        } 

        // =================================================================
        // CASO 2: ORDEN ACTIVA EN LIBRO (new / partially_filled)
        // =================================================================
        if (!finalDetails || rawState === 'new' || rawState === 'partially_filled') {
            // Se mantiene retenido el ciclo (true) mientras siga abierta en el libro
            return true; 
        } 

        // =================================================================
        // CASO 3: CANCELACIÓN TOTAL SIN EJECUCIÓN (Volumen 0)
        // =================================================================
        if (isCanceled && filledVolume === 0) {
            log(`[CONSOLIDATOR LONG BUY] ❌ Orden ${orderIdString} cancelada sin ejecuciones. Liberando slot...`, 'error');
            await updateGeneralBotState({ llastOrder: null });
            return false; 
        }

        // Por defecto, ante estados ambiguos de la API, mantenemos el candado activado por seguridad
        return true; 

    } catch (error) {
        log(`[CONSOLIDATOR LONG BUY] ⚠️ Error en monitoreo (User: ${userId}): ${error.message}`, 'warning');
        
        // Ante errores de red/DNS o timeouts, retenemos la orden para reintentar en la siguiente pasada
        if (isNetworkError(error)) {
            return true;
        }
        
        return false; 
    }
}

module.exports = { monitorAndConsolidate };