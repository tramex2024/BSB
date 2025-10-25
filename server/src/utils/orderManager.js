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

    if (amount < MIN_USDT_VALUE_FOR_BITMART) {
        log(`Error: La cantidad de compra es menor al mínimo de BitMart ($${MIN_USDT_VALUE_FOR_BITMART}). Cancelando.`, 'error');
        await updateBotState('RUNNING', 'long'); 
        return;
    }

    log(`Colocando la primera orden de compra a mercado por ${amount.toFixed(2)} USDT (SIMULADO).`, 'info');

    try {
        // 🛑 BLOQUE DE SIMULACIÓN: COMENTAR para volver a modo REAL 🛑
        
        // const orderResult = await bitmartService.placeOrder( // ❌ COMENTAR
        //      SYMBOL, 
        //      'buy', 
        //      'market', 
        //      amount, 
        //      null 
        // );
        
        // ✅ SIMULACIÓN: Usamos la ID de la orden que ya tenías ejecutada
        const orderResult = { order_id: '1315603471516548352' }; 
        
        // 🛑 FIN BLOQUE DE SIMULACIÓN 🛑

        if (!orderResult || !orderResult.order_id) {
            log(`Error al recibir ID de la orden de BitMart. Resultado: ${JSON.stringify(orderResult)}`, 'error');
            await updateBotState('RUNNING', 'long'); 
            return;
        }

        const orderId = orderResult.order_id;
        log(`Orden de compra colocada. ID: ${orderId}. Iniciando bloqueo y monitoreo...`, 'info');

        // --- 3. ACTUALIZACIÓN DE ESTADO Y BALANCE (Corrección de Persistencia) ---

        const currentBotState = initialCheck; 
        const currentLBalance = parseFloat(currentBotState.lbalance || 0);
        
        // Descontar la cantidad de compra del LBalance.
        const newLBalance = currentLBalance - amount;

        // ✅ CORRECCIÓN CRÍTICA: Actualizar lbalance y lStateData.lastOrder
        // Usamos Autobot.findOneAndUpdate para garantizar la actualización atómica del subdocumento.
        await Autobot.findOneAndUpdate({}, {
            $set: {
                'lbalance': newLBalance,
                'lStateData.lastOrder': {
                    order_id: orderId,
                    side: 'buy',
                    usdt_amount: amount,
                    // Otros campos si son necesarios
                }
            }
        });

        log(`LBalance asignado reducido en ${amount.toFixed(2)} USDT para la orden inicial. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');
        
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
    const sizeVariance = botState.config.long.size_var / 100;
    const nextOrderAmount = usdtAmount * (1 + sizeVariance);

    // --- PRE-DEDUCCIÓN DEL BALANCE ---
    const newLBalance = currentLBalance - usdtAmount;
    if (newLBalance < 0) {
        log(`Error: Capital insuficiente para la orden de cobertura de ${usdtAmount.toFixed(2)} USDT.`, 'error');
        return; 
    }
    await updateGeneralBotState({ lbalance: newLBalance });
    log(`LBalance asignado reducido en ${usdtAmount.toFixed(2)} USDT para la orden de cobertura. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');


    log(`Colocando orden de cobertura a MERCADO por ${usdtAmount.toFixed(2)} USDT.`, 'info');
    
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtAmount); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;  

            // --- 2. ACTUALIZACIÓN DE ESTADO PENDIENTE ---
            
            const lStateUpdate = {
                'lStateData.lastOrder': {
                    order_id: currentOrderId,
                    side: 'buy',
                    usdt_amount: usdtAmount,
                },
                'lStateData.requiredCoverageAmount': nextOrderAmount 
            };
            
            await Autobot.findOneAndUpdate({}, { $set: lStateUpdate });
            log(`Orden de cobertura colocada. ID: ${currentOrderId}. Próximo monto de cobertura calculado: ${nextOrderAmount.toFixed(2)} USDT.`, 'success');

            // --- 3. MONITOREO INMEDIATO ---
            setTimeout(async () => {
                try {
                    const orderDetails = await bitmartService.getOrderDetail(SYMBOL, currentOrderId); 
                    const updatedBotState = await Autobot.findOne({});
                    const filledSize = parseFloat(orderDetails?.filledSize || 0);
                    
                    if ((orderDetails && orderDetails.state === 'filled') || filledSize > 0) {
                        if (updatedBotState) {
                            await handleSuccessfulBuy(updatedBotState, orderDetails, updateGeneralBotState, log);  
                        }
                    } else {
                        log(`La orden de cobertura ${currentOrderId} no se completó/falló sin ejecución.`, 'error');
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
        const order = await bitmartService.placeOrder(SYMBOL, 'SELL', 'market', sellAmount); 

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
            // Usar updateOne o findOneAndUpdate para persistir el lastOrder
            await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });


            setTimeout(async () => {
                const orderDetails = await bitmartService.getOrderDetail(SYMBOL, currentOrderId); 
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