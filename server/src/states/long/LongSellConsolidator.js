/**
 * BSB/server/src/states/long/LongSellConsolidator.js
 * SELL CONSOLIDATOR (LONG): Confirma la ejecución de la venta y liquidación del ciclo Long.
 * Protegido contra ejecuciones parciales, desconexiones de red/DNS y latencia de API BitMart (2026).
 */

const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService');
const { handleSuccessfulSell } = require('../../managers/longDataManager');
const { logSuccessfulCycle } = require('../../../services/cycleLogService'); 
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
 * Monitorea y consolida la orden de venta de cierre de ciclo Long.
 * 
 * @param {Object} botState - Estado actual del bot
 * @param {string} SYMBOL - Par de trading (ej. BMX_USDT)
 * @param {Function} log - Logger del sistema
 * @param {Function} updateLStateData - Actualizador de sub-estado Long
 * @param {Function} updateBotState - Actualizador genérico del bot
 * @param {Function} updateGeneralBotState - Actualizador raíz de MongoDB/memoria
 * @param {string} userId - ID del usuario para persistencia multi-cuenta
 * @param {Object} userCreds - Credenciales API de BitMart
 * @returns {Promise<boolean>} true = orden activa o procesada con éxito; false = slot libre
 */
async function monitorAndConsolidateLongSell(
    botState, 
    SYMBOL = TRADE_SYMBOL, 
    log, 
    updateLStateData, 
    updateBotState, 
    updateGeneralBotState, 
    userId, 
    userCreds
) {
    const lastOrder = botState.llastOrder;

    // 1. Verificación de seguridad de la orden en memoria
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);
    const creds = userCreds;
    const effectiveSymbol = String(SYMBOL || TRADE_SYMBOL);

    try {
        // 2. Consulta aislada de la orden en BitMart
        let finalDetails = await getOrderDetail(effectiveSymbol, orderIdString, creds);
        
        // Extracción y normalización de volumen ejecutado (API V2/V4/WS)
        let filledVolume = parseFloat(
            finalDetails?.filled_size ||    // BitMart API V4
            finalDetails?.filledSize ||     // BitMart API V2
            finalDetails?.filled_volume ||  // Fallback WS
            finalDetails?.filledVolume ||
            finalDetails?.size || 
            0
        );

        const rawState = String(finalDetails?.state || finalDetails?.status || '').toLowerCase();

        // Fallback: Si no hay respuesta directa o el volumen es NaN estando la orden inactiva
        if (!finalDetails || (isNaN(filledVolume) && rawState !== 'new' && rawState !== 'partially_filled')) {
            try {
                const recentOrders = await getRecentOrders(effectiveSymbol, creds);
                const matchedOrder = recentOrders?.find(o => String(o.orderId || o.order_id) === orderIdString);
                
                if (matchedOrder) {
                    finalDetails = matchedOrder;
                    filledVolume = parseFloat(
                        finalDetails.filled_size || 
                        finalDetails.filledVolume || 
                        finalDetails.filledSize || 
                        finalDetails.size || 
                        0
                    );
                }
            } catch (historyErr) {
                // Si falla el respaldo de historial, continuamos con la información disponible
            }
        }

        // Inyección de normalización para handleSuccessfulSell / logSuccessfulCycle
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

        const currentState = String(finalDetails?.state || finalDetails?.status || '').toLowerCase();

        // 3. Evaluación rigurosa de estados de liquidación
        const isFullyFilled = currentState === 'filled' || currentState === 'completed';
        const isCanceled = currentState === 'canceled' || currentState === 'partially_canceled';
        
        // Solo consolidamos la venta si está 100% ejecutada O si fue cancelada habiendo vendido una parte
        const isReadyToConsolidate = isFullyFilled || (isCanceled && filledVolume > 0);

        // =================================================================
        // CASO 1: VENTA EXITOSA (Ciclo finalizado)
        // =================================================================
        if (isReadyToConsolidate) {
            log(`💰 [L-SELL-SUCCESS] Venta confirmada: ${orderIdString} (Vol: ${filledVolume}). Procesando liquidación de ganancias...`, 'success');
            
            const handlerDependencies = { 
                log, 
                updateBotState, 
                updateLStateData, 
                updateGeneralBotState, 
                logSuccessfulCycle,
                userId,
                config: botState.config
            };
            
            // Procesa el cálculo de beneficio neto en USDT y reinicia variables raíz del bot
            await handleSuccessfulSell(botState, finalDetails, handlerDependencies);

            return true;
        }

        // =================================================================
        // CASO 2: ORDEN DE VENTA AÚN ACTIVA EN EL LIBRO (new / partially_filled / 8)
        // =================================================================
        if (!finalDetails || ['new', 'partially_filled', '8'].includes(currentState)) {
            return true; 
        }

        // =================================================================
        // CASO 3: CANCELACIÓN MANUAL O POR PLATAFORMA SIN EJECUCIÓN (Volumen 0)
        // =================================================================
        if (isCanceled && filledVolume === 0) {
            log(`⚠️ [L-SELL-CANCEL] Orden de venta ${orderIdString} cancelada sin ejecuciones. Liberando slot para reintentar...`, 'warning');
            
            // Limpia llastOrder para que LSelling.js pueda volver a colocar la orden si procede
            await updateGeneralBotState({ llastOrder: null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[L-SELL-ERROR] Error en monitoreo de venta (User: ${userId}): ${error.message}`, 'error');
        
        // Se mantiene el candado retenido ante fallos de red/API para evitar sobreposición de órdenes
        return true; 
    }
}

module.exports = { monitorAndConsolidateLongSell };