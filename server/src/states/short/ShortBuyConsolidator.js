/**
 * BSB/server/src/states/short/ShortBuyConsolidator.js
 * SHORT BUY CONSOLIDATOR:
 * Confirma el cierre del ciclo Short cuando se ejecuta la recompra (Take Profit / Buy Market).
 * Protegido contra ejecuciones parciales, desconexiones temporales de red/DNS y latencia de API BitMart (2026).
 */

const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService');
const { handleSuccessfulShortBuy } = require('../../managers/shortDataManager');
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
 * Monitorea y consolida la orden de compra que liquida la posición Short.
 * 
 * @param {Object} botState - Estado actual del bot
 * @param {string} SYMBOL - Par de trading (ej. BMX_USDT)
 * @param {Function} log - Logger del sistema
 * @param {Function} updateSStateData - Actualizador de sub-estado Short
 * @param {Function} updateBotState - Actualizador genérico del bot
 * @param {Function} updateGeneralBotState - Actualizador raíz de MongoDB/memoria
 * @param {string} userId - ID del usuario para persistencia multi-cuenta
 * @param {Object} userCreds - Credenciales API de BitMart
 * @returns {Promise<boolean>} true = orden activa o procesada con éxito; false = slot libre
 */
async function monitorAndConsolidateShortBuy(
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

    // 1. En Short, el ciclo se liquida con una orden de compra (buy)
    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'buy') {
        return false; 
    }

    const orderIdString = String(lastOrder.order_id);
    const creds = userCreds;
    const effectiveSymbol = String(SYMBOL || TRADE_SYMBOL);

    try {
        // 2. Consulta aislada de la orden en BitMart con las credenciales del usuario
        let finalDetails = await getOrderDetail(effectiveSymbol, orderIdString, creds);
        
        let filledVolume = parseFloat(
            finalDetails?.filled_size ||    // BitMart API V4
            finalDetails?.filledSize ||     // BitMart API V2
            finalDetails?.filled_volume ||  // Websocket/History
            finalDetails?.filledVolume ||
            finalDetails?.size || 
            0
        );

        const rawState = String(finalDetails?.state || finalDetails?.status || '').toLowerCase();

        // Fallback: Si la consulta directa es ambigua o devuelve valores nulos
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
                // Si falla la búsqueda en el historial, continuamos con el estado disponible
            }
        }

        // Normalización explícita para handleSuccessfulShortBuy / logSuccessfulCycle
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

        // 3. Evaluación estricta de estado de liquidación
        const isFullyFilled = currentState === 'filled' || currentState === 'completed';
        const isCanceled = currentState === 'canceled' || currentState === 'partially_canceled';

        // Solo se liquida el ciclo si la compra se completó al 100% O si fue cancelada habiendo recomprado una parte
        const isReadyToConsolidate = isFullyFilled || (isCanceled && filledVolume > 0);

        // =================================================================
        // CASO A: RECOMPRA CONFIRMADA (Cierre de posición Short exitoso)
        // =================================================================
        if (isReadyToConsolidate) {
            log(`💰 [S-BUY-SUCCESS] Recompra confirmada: ${orderIdString} (Vol: ${filledVolume}). Liquidando ciclo y calculando beneficio...`, 'success');
            
            const handlerDependencies = { 
                userId, 
                log, 
                updateBotState, 
                updateSStateData, 
                updateGeneralBotState, 
                logSuccessfulCycle, 
                config: botState.config 
            };
            
            // El manager procesa la recompra, guarda la orden en historial y resetea el estado raíz Short (CLEAN_SHORT_ROOT)
            await handleSuccessfulShortBuy(botState, finalDetails, handlerDependencies);
            return true;
        }

        // =================================================================
        // CASO B: ORDEN DE COMPRA AÚN PENDIENTE EN EL LIBRO (new / partially_filled / 8)
        // =================================================================
        if (!finalDetails || ['new', 'partially_filled', '8'].includes(currentState)) {
            return true; 
        }

        // =================================================================
        // CASO C: CANCELACIÓN O FALLO DE EJECUCIÓN SIN COMPRA (Volumen 0)
        // =================================================================
        if (isCanceled && filledVolume === 0) {
            log(`⚠️ [S-BUY-CANCEL] Orden de recompra ${orderIdString} cancelada. Liberando slot para reintentar la compra...`, 'warning');
            
            // Limpia slastOrder para que el estado SBuying.js pueda reintentar la recompra
            await updateGeneralBotState({ slastOrder: null });
            return true;
        }

        return true;

    } catch (error) {
        log(`[S-BUY-ERROR] Error en monitoreo de recompra Short (User: ${userId}): ${error.message}`, 'error');
        // Se mantiene el bloqueo activo durante cualquier falla de red/API para proteger la posición
        return true; 
    }
}

module.exports = { monitorAndConsolidateShortBuy };