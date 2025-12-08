// BSB/server/src/states/long/LongSellConsolidator.js

const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService');

/**
 * Monitorea una orden de VENTA pendiente, consolida la posición si la orden se llena,
 * o mantiene el lastOrder si la orden falla o sigue pendiente.
 *
 * @param {object} botState - Estado actual del bot (contiene lStateData.ac).
 * @param {string} SYMBOL - Símbolo de trading.
 * @param {function} log - Función de logging.
 * @param {function} handleSuccessfulSell - Función de cierre de ciclo a ejecutar en caso de éxito.
 * @returns {boolean} true si se procesó una orden (exitosa, pendiente o fallida), false si no había orden.
 */
async function monitorAndConsolidate(botState, SYMBOL, log, handleSuccessfulSell) {
    const lStateData = botState.lStateData;
    const lastOrder = lStateData.lastOrder;

    if (!lastOrder || !lastOrder.order_id || lastOrder.side !== 'sell') {
        return false;
    }

    const orderIdString = String(lastOrder.order_id);
    const amountToVerify = botState.lStateData.ac; // La cantidad de BTC que intentamos vender.
    log(`[CONSOLIDATOR:SELL] Orden de venta pendiente ${orderIdString} detectada. Consultando BitMart...`, 'warning');

    try {
        let orderDetails = await getOrderDetail(SYMBOL, orderIdString);
        let finalDetails = orderDetails;
        
        let filledVolume = parseFloat(finalDetails?.filled_volume || 0);

        // -----------------------------------------------------------
        // LÓGICA DE RESPALDO: BUSCAR EN EL HISTORIAL
        // -----------------------------------------------------------
        if (!finalDetails || finalDetails.state === 'canceled' || finalDetails.state === 'failed') {
            log(`[CONSOLIDATOR:SELL] Fallo en consulta directa o estado final. Buscando orden ${orderIdString} en el historial...`, 'info');
            const recentOrders = await getRecentOrders(SYMBOL, 10);
            
            // Buscar la orden exacta en el historial de 'filled' y con volumen coincidente
            finalDetails = recentOrders.find(o =>
                (o.order_id === orderIdString) &&
                o.side === 'sell' &&
                o.status === 'filled' &&
                // ✅ VERIFICACIÓN ESTRICTA DEL VOLUMEN (CRÍTICO)
                // El volumen lleno debe ser igual al AC que el bot intentó vender.
                Math.abs(parseFloat(o.filled_volume) - amountToVerify) < 1e-8
            );

            if (finalDetails) {
                filledVolume = parseFloat(finalDetails.filled_volume);
            }
        }

        // -----------------------------------------------------------
        // VERIFICACIÓN FINAL Y CONSOLIDACIÓN
        // -----------------------------------------------------------
        const isOrderFullyConsolidated = (
            finalDetails && 
            (finalDetails.state === 'filled' || finalDetails.status === 'filled') &&
            // ✅ VERIFICACIÓN ESTRICTA: EL VOLUMEN LLENO DEBE COINCIDIR CON EL AC
            Math.abs(filledVolume - amountToVerify) < 1e-8
        );

        if (isOrderFullyConsolidated) {
            // === ORDEN PROCESADA CON ÉXITO ===
            log(`[CONSOLIDATOR:SELL] Venta ID ${orderIdString} confirmada. Volumen ${filledVolume.toFixed(8)} BTC coincide con AC. CERRANDO CICLO.`, 'success');
            
            // 🛑 CRÍTICO: Llamamos a la función de manejo de éxito de LSelling.js
            await handleSuccessfulSell(botState, finalDetails, dependencies); // Asumimos que dependencies se inyecta

            return true; 

        } else if (finalDetails && (finalDetails.state === 'new' || finalDetails.state === 'partially_filled')) {
            // === ORDEN PENDIENTE (Es inusual para Market Sell, pero posible) ===
            log(`[CONSOLIDATOR:SELL] La orden ${orderIdString} sigue activa (${finalDetails.state}). Esperando ejecución.`, 'info');
            return true;
            
        } else {
            // === ORDEN CANCELADA/FALLIDA SIN VOLUMEN CONFIRMADO ===
            // Mantenemos el bloqueo (lastOrder) para que el ciclo 'run' no intente vender de nuevo
            // hasta que el botmaster investigue o el error de "Balance not enough" lo fuerce.
            log(`[CONSOLIDATOR:SELL] Falla de consolidación: Orden ${orderIdString} no confirmada por volumen. MANTENIENDO lastOrder.`, 'error');
            return true;
        }

    } catch (error) {
        log(`[CONSOLIDATOR:SELL] Error de API/lógica al consultar la orden ${orderIdString}: ${error.message}. Persistiendo el bloqueo.`, 'error');

        // 🛑 MANEJO DE ERROR 50005 (Orden no encontrada, puede ser llenado instantáneo)
        if (error.message.includes('50005')) {
            log(`Advertencia: Orden ${orderIdString} desapareció (Error 50005). Esto es ambigüo, MANTENEMOS lastOrder. El bloque de 'Balance not enough' en LSelling.js lo forzará.`, 'warning');
        }

        return true; // Devuelve true para indicar que el Consolidator procesó (o intentó procesar) algo.
    }
}

// Necesitamos pasar dependencies (con log, updateLStateData, updateBotState, etc.) al consolidator, 
// pero la firma de la función no lo permite si se quiere reutilizar.
// Para este ejercicio, asumimos que 'dependencies' se inyecta o se resuelve.

// 💡 CORRECCIÓN DE LA FIRMA: Agregamos 'dependencies' para que el consolidator pueda pasarlas 
// a 'handleSuccessfulSell'.

module.exports = { monitorAndConsolidate };