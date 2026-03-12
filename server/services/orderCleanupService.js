// BSB/server/src/services/orderCleanupService.js
const { cancelActiveOrder } = require('./bitmartService');

/**
 * ORCHESTRATOR: Limpieza de seguridad antes de apagar el bot.
 * Cancela cualquier orden pendiente en el exchange para evitar órdenes "huérfanas".
 */
const OrderCleanupService = {
    async cleanupPendingOrders(strategyType, botState, userCreds, log) {
        const prefix = strategyType === 'short' ? 's' : (strategyType === 'long' ? 'l' : 'ai');
        const lastOrder = botState[`${prefix}lastOrder` || `${prefix}last_order` ];
        const SYMBOL = botState.config?.symbol || 'BTC_USDT';

        if (lastOrder && (lastOrder.order_id || lastOrder.orderId)) {
            const orderId = String(lastOrder.order_id || lastOrder.orderId);
            
            log(`[CLEANUP] Detectada orden pendiente ${orderId} en ${strategyType}. Cancelando antes de detener...`, 'info');

            try {
                // Llamada directa al servicio de BitMart para cancelar
                const cancelResult = await cancelActiveOrder(SYMBOL, orderId, userCreds);
                
                if (cancelResult) {
                    log(`[CLEANUP] ✅ Orden ${orderId} cancelada exitosamente.`, 'success');
                    return true;
                }
            } catch (error) {
                // Si la orden ya no existe (se llenó justo antes), lo ignoramos y procedemos
                if (error.message.includes('order not found') || error.message.includes('400')) {
                    log(`[CLEANUP] La orden ${orderId} ya no está activa en el libro.`, 'info');
                    return true;
                }
                log(`[CLEANUP] ❌ Error al cancelar orden: ${error.message}`, 'error');
                throw error; // Re-lanzamos para evitar que el bot se detenga en un estado inconsistente
            }
        }

        return true; // No había órdenes o ya se limpiaron
    }
};

module.exports = OrderCleanupService;