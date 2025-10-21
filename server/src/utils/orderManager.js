// BSB/server/src/utils/orderManager.js

const Autobot = require('../../models/Autobot');
const { handleSuccessfulBuy, handleSuccessfulSell } = require('./dataManager');

// 🚨 CORRECCIÓN: Importamos el módulo completo como 'bitmartService'
const bitmartService = require('../../services/bitmartService'); 

// Eliminamos la línea const { placeOrder, getOrderDetail, cancelOrder } = ...
// y usamos bitmartService.placeOrder, bitmartService.getOrderDetail, etc., en todo el archivo.

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;
const ORDER_CHECK_TIMEOUT_MS = 2000;

/**
 * Coloca la primera orden de compra (o inicial) y realiza un bloqueo atómico.
 * @param {object} config - Configuración del bot.
 * @param {function} log - Función de logging.
 * @param {function} updateBotState - Función para actualizar el estado del bot (lstate/sstate).
 * @param {function} updateGeneralBotState - Función para actualizar campos generales (lbalance/sbalance).
 */
async function placeFirstBuyOrder(config, log, updateBotState, updateGeneralBotState) {
    
    // --- 1. BLOQUEO ATÓMICO Y TRANSICIÓN DE ESTADO ---
    // Intentamos cambiar el estado de RUNNING a BUYING en una sola operación atómica.
    
    const initialCheck = await Autobot.findOneAndUpdate(
        { lstate: 'RUNNING' }, // Condición: SOLO actualiza si el estado actual es RUNNING.
        { $set: { lstate: 'BUYING' } }, // Actualización: Cambia el estado a BUYING.
        { new: true } // Retorna el documento actualizado (si la operación fue exitosa).
    );

    if (!initialCheck) {
        // Esto significa que otro ciclo ya se adelantó y cambió el estado. ¡Bloqueo exitoso!
        log('Advertencia: Intento de doble compra bloqueado. El estado ya ha cambiado a BUYING.', 'warning');
        return; 
    }
    
    // Si el código llega a este punto, hemos asegurado la DB y el estado AHORA es BUYING.
    // --------------------------------------------------------------------
    
    const { purchaseUsdt } = config.long;
    const SYMBOL = config.symbol;
    const amount = parseFloat(purchaseUsdt);

    if (amount < 5) {
        log('Error: La cantidad de compra es menor al mínimo de BitMart ($5). Cancelando.', 'error');
        // Revertir el estado ya que no se colocó la orden real
        await updateBotState('RUNNING', 'long'); 
        return;
    }

    log(`Colocando la primera orden de compra a mercado por ${amount.toFixed(2)} USDT.`, 'info');

    try {
        // ✅ Usamos la función genérica 'placeOrder' que SÍ existe y le pasamos los parámetros
const orderResult = await bitmartService.placeOrder(
    SYMBOL, 
    'buy', 
    'market', 
    amount, // La cantidad es el 'notional'
    null // No hay precio para una orden a mercado
);

        if (!orderResult || !orderResult.order_id) {
            log(`Error al recibir ID de la orden de BitMart. Resultado: ${JSON.stringify(orderResult)}`, 'error');
            // Revertir el estado si la orden no se pudo colocar (por ejemplo, error de API)
            await updateBotState('RUNNING', 'long'); 
            return;
        }

        const orderId = orderResult.order_id;
        log(`Orden de compra colocada. ID: ${orderId}. Iniciando bloqueo y monitoreo...`, 'info');

        // --- 3. ACTUALIZACIÓN DE ESTADO Y BALANCE ---

        // Asumiendo que initialCheck contiene el botState actualizado (lstate: BUYING)
        const currentBotState = initialCheck; 
        const currentLBalance = parseFloat(currentBotState.lbalance || 0);
        
        // Descontar la cantidad de compra del LBalance.
        const newLBalance = currentLBalance - amount;

        // Guardar el lastOrder y el nuevo LBalance
        await updateGeneralBotState({
            'lbalance': newLBalance,
            'lStateData.lastOrder': {
                order_id: orderId,
                side: 'buy',
                usdt_amount: amount,
                // Agrega otros campos necesarios aquí
            }
        });

        log(`LBalance asignado reducido en ${amount.toFixed(2)} USDT para la orden inicial. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');
        
        // No es necesario llamar a updateBotState aquí, ya que el bloqueo atómico ya lo hizo.

    } catch (error) {
        log(`Error CRÍTICO al colocar la primera orden: ${error.message}`, 'error');
        
        // Revertir el estado a RUNNING en caso de un error de API/Excepción
        await updateBotState('RUNNING', 'long');
    }
}

/**
 * Coloca una orden de compra de cobertura (a Mercado) y actualiza el capital para la ejecución.
 * * @param {object} botState - Estado actual del bot.
 * @param {number} usdtAmount - Cantidad de USDT a comprar (requerido para esta orden).
 * @param {number} nextCoveragePrice - Precio objetivo de la próxima orden de cobertura (solo para referencia de DB).
 * @param {function} log - Función de logging.
 * @param {function} updateGeneralBotState - Función para actualizar el estado general.
 */
async function placeCoverageBuyOrder(botState, usdtAmount, nextCoveragePrice, log, updateGeneralBotState) { 
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    const currentLBalance = parseFloat(botState.lbalance || 0);

    // --- CÁLCULO DE LA PRÓXIMA COBERTURA (Progresión Geométrica) ---
    // Usamos el monto de esta orden (usdtAmount) para calcular el monto de la ORDEN SIGUIENTE.
    const sizeVariance = botState.config.long.size_var / 100;
    const nextOrderAmount = usdtAmount * (1 + sizeVariance);

    // --- PRE-DEDUCCIÓN DEL BALANCE ---
    // Deducción del LBalance ANTES de colocar la orden (pre-deducción)
    const newLBalance = currentLBalance - usdtAmount;
    if (newLBalance < 0) {
        log(`Error: Capital insuficiente para la orden de cobertura de ${usdtAmount.toFixed(2)} USDT.`, 'error');
        // El bot debería haber cambiado a RUNNING en LBuying.js, pero aseguramos la salida.
        return; 
    }
    await updateGeneralBotState({ lbalance: newLBalance });
    log(`LBalance asignado reducido en ${usdtAmount.toFixed(2)} USDT para la orden de cobertura. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');


    log(`Colocando orden de cobertura a MERCADO por ${usdtAmount.toFixed(2)} USDT.`, 'info');
    
    try {
        // Colocamos la orden usando el monto necesario para ESTA compra.
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtAmount); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;  

            // --- 2. ACTUALIZACIÓN DE ESTADO PENDIENTE ---
            
            // Actualizar lastOrder y el monto de la SIGUIENTE orden de cobertura.
            const lStateUpdate = {
                'lStateData.lastOrder': {
                    order_id: currentOrderId,
                    side: 'buy',
                    usdt_amount: usdtAmount, // Monto utilizado en ESTA orden (para la devolución)
                },
                // 🚨 Actualizamos el monto requerido para la SIGUIENTE compra
                'lStateData.requiredCoverageAmount': nextOrderAmount 
            };
            
            await Autobot.findOneAndUpdate({}, { $set: lStateUpdate });
            log(`Orden de cobertura colocada. ID: ${currentOrderId}. Próximo monto de cobertura calculado: ${nextOrderAmount.toFixed(2)} USDT.`, 'success');

            // --- 3. MONITOREO INMEDIATO ---
            // Usaremos el mismo mecanismo de setTimeout para el monitoreo inmediato
            setTimeout(async () => {
                try {
                    const orderDetails = await bitmartService.getOrderDetail(SYMBOL, currentOrderId); 
                    const updatedBotState = await Autobot.findOne({});
                    const filledSize = parseFloat(orderDetails?.filledSize || 0);
                    
                    if ((orderDetails && orderDetails.state === 'filled') || filledSize > 0) {
                        if (updatedBotState) {
                            // handleSuccessfulBuy: Actualiza PPC, AC, lastExecutionPrice, y limpia lastOrder.
                            await handleSuccessfulBuy(updatedBotState, orderDetails, updateGeneralBotState, log);  
                        }
                    } else {
                        log(`La orden de cobertura ${currentOrderId} no se completó/falló sin ejecución.`, 'error');
                        // Si la orden falla, limpiamos el lastOrder y revertimos el balance no gastado
                        if (updatedBotState) {
                            const actualUsdtSpent = parseFloat(orderDetails?.notional || 0);
                            const usdtToRefund = usdtAmount - actualUsdtSpent;

                            if (usdtToRefund > 0.01) {
                                const finalLBalance = parseFloat(updatedBotState.lbalance || 0) + usdtToRefund;
                                await updateGeneralBotState({ lbalance: finalLBalance });
                                log(`Se revierte ${usdtToRefund.toFixed(2)} USDT al balance.`, 'info');
                            }
                            
                            await Autobot.findOneAndUpdate({}, { 'lStateData.lastOrder': null });
                        }
                    }
                } catch (timeoutError) {
                    log(`Error en el chequeo de timeout de la orden de cobertura: ${timeoutError.message}`, 'error');
                }
            }, ORDER_CHECK_TIMEOUT_MS);

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
 * @param {object} config - Configuración del bot.
 * @param {number} sellAmount - Cantidad de la moneda base a vender (e.g., BTC).
 * @param {function} log - Función de logging.
 * @param {function} handleSuccessfulSell - Función de manejo de venta exitosa.
 * @param {object} botState - Estado actual del bot.
 * @param {object} handlerDependencies - Dependencias necesarias para el handler de venta.
 */
async function placeSellOrder(config, sellAmount, log, handleSuccessfulSell, botState, handlerDependencies) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    log(`Colocando orden de venta a mercado por ${sellAmount.toFixed(8)} BTC.`, 'info');
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'SELL', 'market', sellAmount); // ✅ CORREGIDO

        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            log(`Orden de venta colocada. ID: ${currentOrderId}. Esperando confirmación...`, 'success');
            
            botState.lStateData.lastOrder = {
                order_id: currentOrderId,
                price: botState.lStateData.pc,
                size: sellAmount,
                side: 'sell',
                state: 'pending_fill'
            };
            await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });


            setTimeout(async () => {
                const orderDetails = await bitmartService.getOrderDetail(SYMBOL, currentOrderId); // ✅ CORREGIDO
                const filledSize = parseFloat(orderDetails?.filledSize || 0);

                if ((orderDetails && orderDetails.state === 'filled') || filledSize > 0) {
                    await handleSuccessfulSell(botState, orderDetails, handlerDependencies); 
                } else {
                    log(`La orden de venta ${currentOrderId} no se completó.`, 'error');
                    const updatedBotState = await Autobot.findOne({});
                    if (updatedBotState) {
                        updatedBotState.lStateData.lastOrder = null;
                        await Autobot.findOneAndUpdate({}, { 'lStateData': updatedBotState.lStateData });
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {
            log(`Error al colocar la orden de venta. Respuesta API: ${JSON.stringify(order)}`, 'error');
        }
    } catch (error) {
        log(`Error de API al colocar la orden de venta: ${error.message}`, 'error');
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
        
        const result = await bitmartService.cancelOrder(SYMBOL, orderId); // ✅ CORREGIDO
        
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