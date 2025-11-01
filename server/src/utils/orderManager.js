// BSB/server/src/utils/orderManager.js

const Autobot = require('../../models/Autobot');
const { handleSuccessfulBuy, handleSuccessfulSell } = require('./dataManager');

const bitmartService = require('../../services/bitmartService'); 

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;
const ORDER_CHECK_TIMEOUT_MS = 2000;

/**
 * Coloca la primera orden de compra (o inicial) y realiza un bloqueo atómico.
 *
 * NOTA: Esta versión incluye la SIMULACIÓN de orden para pruebas.
 * * @param {object} config - Configuración del bot.
 * @param {function} log - Función de logging.
 * @param {function} updateBotState - Función para actualizar el estado del bot (lstate/sstate).
 * @param {function} updateGeneralBotState - Función para actualizar campos generales (lbalance/sbalance).
 */
async function placeFirstBuyOrder(config, log, updateBotState, updateGeneralBotState) {
    
    // --- 1. BLOQUEO ATÓMICO Y TRANSICIÓN DE ESTADO ---
    const initialCheck = await Autobot.findOneAndUpdate(
        { lstate: 'RUNNING' }, 
        { $set: { lstate: 'BUYING' } }, 
        { new: true } 
    );

    if (!initialCheck) {
        log('Advertencia: Intento de doble compra bloqueado. El estado ya ha cambiado a BUYING.', 'warning');
        return; 
    }
    
    // --------------------------------------------------------------------
    
    const { purchaseUsdt } = config.long;
    const SYMBOL = config.symbol;
    const amount = parseFloat(purchaseUsdt);
   
    // A. Error: Monto menor al mínimo
if (amount < MIN_USDT_VALUE_FOR_BITMART) {
    log(`Error: La cantidad de compra es menor al mínimo de BitMart ($${MIN_USDT_VALUE_FOR_BITMART}). Cancelando.`, 'error');
    // 💡 Corregido: Volver a NO_COVERAGE, ya que la configuración es errónea.
    await updateBotState('NO_COVERAGE', 'long'); 
    return;
}

    log(`Colocando la primera orden de compra a mercado por ${amount.toFixed(2)} USDT.`, 'info'); // Ya no dice SIMULADO

    try {
        // 🛑 BLOQUE DE SIMULACIÓN ELIMINADO / COMENTADO 🛑
        
        const orderResult = await bitmartService.placeOrder( // ✅ VOLVEMOS A LA LLAMADA REAL
            SYMBOL, 
            'buy', 
            'market', 
            amount, 
            null 
        );             

        const orderId = orderResult.order_id;
        log(`Orden de compra colocada. ID: ${orderId}. Iniciando bloqueo y monitoreo...`, 'info');

        // --- 3. ACTUALIZACIÓN DE ESTADO Y BALANCE (Corrección de Persistencia) ---

        const currentBotState = initialCheck; 
        const currentLBalance = parseFloat(currentBotState.lbalance || 0);
        
        // Descontar la cantidad de compra del LBalance.
        const newLBalance = currentLBalance - amount;

        // ✅ CORRECCIÓN FINAL: Actualizar lbalance, lastOrder Y orderCountInCycle
await Autobot.findOneAndUpdate({}, {
    $set: {
        'lbalance': newLBalance,
        'lStateData.lastOrder': {
            order_id: orderId,
            side: 'buy',
            usdt_amount: amount,
        }
    },
    $inc: {
        'lStateData.orderCountInCycle': 1 // 💡 IMPORTANTE: Incrementamos aquí
    }
});

        log(`LBalance asignado reducido en ${amount.toFixed(2)} USDT para la orden inicial. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');
        
    } catch (error) {
        log(`Error CRÍTICO al colocar la primera orden: ${error.message}`, 'error');
        
        // Revertir el estado a RUNNING en caso de un error de API/Excepción
        await updateBotState('BUYING', 'long');
    }
}

/**
 * Coloca una orden de compra de cobertura (a Mercado) y actualiza el capital para la ejecución.
 * (CORREGIDO: Eliminado el Monitoreo por Timeout; se delega a LBuying.js)
 * @param {object} botState - Estado actual del bot.
 * @param {number} usdtAmount - Cantidad de USDT a comprar (requerido para esta orden).
 * @param {number} nextCoveragePrice - Precio objetivo de la próxima orden de cobertura (solo para referencia de DB).
 * @param {function} log - Función de logging.
 * @param {function} updateGeneralBotState - Función para actualizar el estado general.
 */
async function placeCoverageBuyOrder(botState, usdtAmount, nextCoveragePrice, log, updateGeneralBotState) { 
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    const currentLBalance = parseFloat(botState.lbalance || 0);

    // --- CÁLCULO DE LA PRÓXIMA COBERTURA (Progresión Geométrica) ---
    const sizeVariance = botState.config.long.size_var / 100;
    const nextOrderAmount = usdtAmount * (1 + sizeVariance);

    // --- PRE-DEDUCCIÓN DEL BALANCE ---
    const newLBalance = currentLBalance - usdtAmount;
    if (newLBalance < 0) {
        log(`Error: Capital insuficiente para la orden de cobertura de ${usdtAmount.toFixed(2)} USDT.`, 'error');
        return; 
    }
    // NOTA: La deducción de lbalance se hace antes de la colocación para garantizar que el bot no sobre-gaste
    await updateGeneralBotState({ lbalance: newLBalance });
    log(`LBalance asignado reducido en ${usdtAmount.toFixed(2)} USDT para la orden de cobertura. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');


    log(`Colocando orden de cobertura a MERCADO por ${usdtAmount.toFixed(2)} USDT.`, 'info');
    
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtAmount); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;  

            // --- 2. ACTUALIZACIÓN ATÓMICA DE ESTADO PENDIENTE ---
            // Solo guardamos la orden, LBuying.js se encargará de consolidar y contar.
            const updateResult = await Autobot.findOneAndUpdate({}, { 
                $set: {
                    'lStateData.lastOrder': {
                        order_id: currentOrderId,
                        side: 'buy',
                        usdt_amount: usdtAmount,
                    },
                    'lStateData.requiredCoverageAmount': nextOrderAmount 
                }
            }, { new: true });
            
            if (updateResult) {
                log(`Orden de cobertura colocada. ID: ${currentOrderId}. Próximo monto de cobertura calculado: ${nextOrderAmount.toFixed(2)} USDT.`, 'success');
            } else {
                log(`Advertencia: Orden colocada (${currentOrderId}), pero no se pudo actualizar la DB. Revisar manualmente.`, 'error');
            }
            
            // NO MÁS LÓGICA DE MONITOREO/TIMEOUT AQUÍ. LBuying.js lo manejará.

        } else {
            log(`Error al colocar la orden de cobertura. Respuesta API: ${JSON.stringify(order)}`, 'error');
            
            // Revertir el balance pre-deducido si la orden nunca se colocó.
            const finalLBalance = newLBalance + usdtAmount;
            await updateGeneralBotState({ lbalance: finalLBalance });
            log(`Se revierte ${usdtAmount.toFixed(2)} USDT al balance (error de colocación).`, 'info');
        }
    } catch (error) {
        log(`Error de API al colocar la orden de cobertura: ${error.message}`, 'error');
        // Revertir el balance pre-deducido en caso de error de API
        const finalLBalance = newLBalance + usdtAmount;
        await updateGeneralBotState({ lbalance: finalLBalance });
        log(`Se revierte ${usdtAmount.toFixed(2)} USDT al balance (error de API).`, 'info');
    }
}

/**
 * Coloca una orden de venta a mercado.
 * (La función handleSuccessfulSell es delegada a LSelling.js para la lógica de cierre de ciclo).
 * @param {object} config - Configuración del bot.
 * @param {object} creds - Credenciales del bot.
 * @param {number} sellAmount - Cantidad de la moneda base a vender (e.g., BTC).
 * @param {function} log - Función de logging.
 * @param {function} handleSuccessfulSell - Función de manejo de venta exitosa (del estado LSelling).
 * @param {object} botState - Estado actual del bot.
 * @param {object} handlerDependencies - Dependencias necesarias (config, log, etc.).
 */
async function placeSellOrder(config, creds, sellAmount, log, handleSuccessfulSell, botState, handlerDependencies) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    // Aseguramos que sellAmount sea un número justo antes de usarlo
    const amountToSell = parseFloat(sellAmount);

    log(`Colocando orden de venta a mercado por ${sellAmount.toFixed(8)} BTC.`, 'info');
    try {
        // La API de BitMart usa 'SELL' para órdenes
        const order = await bitmartService.placeOrder(SYMBOL, 'SELL', 'market', amountToSell); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            log(`Orden de venta colocada. ID: ${currentOrderId}. Iniciando bloqueo y monitoreo en LSelling...`, 'success');
            
            // 1. Crear el objeto lastOrder de venta pendiente
            const sellLastOrder = {
                order_id: currentOrderId,
                price: botState.lStateData.ppc, // Usamos PPC como referencia de costo
                size: sellAmount,
                side: 'sell',
                state: 'pending_fill'
            };
            
            // 2. Persistir el lastOrder de forma atómica
            await Autobot.findOneAndUpdate({}, { 
                $set: { 'lStateData.lastOrder': sellLastOrder } 
            });

            // 3. 💡 LÓGICA DE VERIFICACIÓN INMEDIATA (Post-Orden de Mercado)
            try {
                // Pausa breve para que BitMart consolide (opcional, pero ayuda)
                await new Promise(resolve => setTimeout(resolve, 100)); 

                const orderDetails = await bitmartService.getOrderDetail(creds, SYMBOL, currentOrderId);
                
                const filledVolume = parseFloat(orderDetails.filled_volume || 0);

                if (filledVolume >= amountToSell * 0.999) { // 99.9% para tolerancia
                    log(`Verificación: Orden ID ${currentOrderId} COMPLETADA (${filledVolume.toFixed(8)}/${amountToSell.toFixed(8)}).`, 'success');
                    
                    // Llama al handler y cierra el ciclo (REINICIO)
                    await handleSuccessfulSell(botState, orderDetails, handlerDependencies);
                    
                    // 3. Limpiar lastOrder después del éxito.
                    await Autobot.findOneAndUpdate({}, { $set: { 'lStateData.lastOrder': null } });
                } else {
                    // Si no está llenada y no falló la consulta (caso raro de orden parcial/fallida)
                    log(`Advertencia: Orden ID ${currentOrderId} no se llenó completamente (${filledVolume.toFixed(8)}). Permitiendo reintento.`, 'warning');
                }

            } catch (error) { // <-- Cierra el try de la verificación inmediata
                // Maneja el error 50005 (Orden no encontrada/llenado instantáneo)
                if (error.message.includes('50005')) {
                    log(`Advertencia: Orden ${currentOrderId} desapareció (llenado instantáneo). Asumiendo llenado.`, 'warning');
                    
                    // ASUME LLENADO TOTAL Y PROCESA EL CIERRE DEL CICLO
                    // 🛑 CORRECCIÓN CRÍTICA: Se pasa el 'botState' (posición anterior) y detalles mínimos
                    // Se asume que el volumen llenado es igual a la posición actual (ac) para el cálculo.
                    await handleSuccessfulSell(botState, { filled_volume: botState.lStateData.ac, priceAvg: 0 }, handlerDependencies); 
                    await Autobot.findOneAndUpdate({}, { $set: { 'lStateData.lastOrder': null } });
                } else {
                    log(`Error al verificar la orden ${currentOrderId}: ${error.message}`, 'error');
                    // Dejar lastOrder para que LSelling.js lo maneje manualmente/en el siguiente ciclo.
                }
            } // <-- Cierre del catch de la verificación inmediata
        } else { // <-- Cierre del if (order && order.order_id)
            log(`Error al colocar la orden de venta. Respuesta API: ${JSON.stringify(order)}`, 'error');
            // NOTA: Si falla la colocación, el estado se mantiene en SELLING para reintento/cancelación manual.
        }
    } catch (error) { // <-- Cierra el try principal de la función
        log(`Error de API al colocar la orden: ${error.message}`, 'error');
    }
}

/**
 * Cancela la última orden activa del bot.
 * @param {object} botState - Estado actual del bot.
 * @param {function} log - Función de logging inyectada.
 */
async function cancelActiveOrders(botState, log) {
    if (!botState.lStateData.lastOrder || !botState.lStateData.lastOrder.order_id) {
        log("No hay una orden para cancelar registrada.", 'info');
        return;
    }

    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    const orderId = botState.lStateData.lastOrder.order_id;
    
    try {
        log(`Intentando cancelar orden ID: ${orderId}...`, 'warning');
        
        const result = await bitmartService.cancelOrder(SYMBOL, orderId); 
        
        if (result && result.code === 1000) {
            log(`Orden ${orderId} cancelada exitosamente.`, 'success');
        } else {
            log(`No se pudo cancelar la orden ${orderId}. Razón: ${JSON.stringify(result)}`, 'error');
        }
        
        // Limpiar el lastOrder del estado
        botState.lStateData.lastOrder = null;
        await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });

    } catch (error) {
        log(`Error de API al intentar cancelar la orden ${orderId}: ${error.message}`, 'error');
    }
}

module.exports = {
    placeFirstBuyOrder,
    placeCoverageBuyOrder,
    placeSellOrder,
    cancelActiveOrders,
    MIN_USDT_VALUE_FOR_BITMART
};