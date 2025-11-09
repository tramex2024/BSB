const Autobot = require('../../models/Autobot');
const bitmartService = require('../../services/bitmartService'); 
// No importamos 'dataManager' aquí para evitar dependencia circular.
// En su lugar, requerimos 'updateBotState' como argumento si es necesario.

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;

/**
 * Coloca la primera orden de compra (o inicial).
 * @param {object} config - Configuración del bot.
 * @param {function} log - Función de logging.
 * @param {function} updateBotState - Función para actualizar el estado del bot (lstate/sstate).
 * @param {function} updateGeneralBotState - Función para actualizar campos generales (lbalance/sbalance).
 */
async function placeFirstBuyOrder(config, log, updateBotState, updateGeneralBotState) {
    
    const { purchaseUsdt } = config.long;
    const SYMBOL = config.symbol;
    const amount = parseFloat(purchaseUsdt);
    
    // A. Error: Monto menor al mínimo
    if (amount < MIN_USDT_VALUE_FOR_BITMART) {
        log(`Error: La cantidad de compra es menor al mínimo de BitMart ($${MIN_USDT_VALUE_FOR_BITMART}). Cancelando.`, 'error');
        await updateBotState('NO_COVERAGE', 'long'); 
        return;
    }

    log(`Colocando la primera orden de compra a mercado por ${amount.toFixed(2)} USDT.`, 'info'); 

    try {
        const orderResult = await bitmartService.placeOrder(
            SYMBOL, 
            'buy', 
            'market', 
            amount, 
            null 
        ); 

        const orderId = orderResult.order_id;
        log(`Orden de compra colocada. ID: ${orderId}. Iniciando bloqueo y monitoreo...`, 'info');

        // --- 3. ACTUALIZACIÓN DE ESTADO Y BALANCE (Persistencia Atómica) ---
        
        // Obtenemos el estado actual *solo* para calcular el nuevo LBalance
        const currentBotState = await Autobot.findOne({});
        if (!currentBotState) {
            log('Error: No se encontró el documento de Autobot para deducir el balance.', 'error');
            throw new Error('Autobot document not found.');
        }

        const currentLBalance = parseFloat(currentBotState.lbalance || 0);
        const newLBalance = currentLBalance - amount;

        // ✅ Actualizar lbalance, lastOrder 
        await Autobot.findOneAndUpdate({}, {
            $set: {
                'lbalance': newLBalance,
                'lStateData.lastOrder': {
                    order_id: orderId,
                    side: 'buy',
                    usdt_amount: amount,
                }
            }
            
        });

        log(`LBalance asignado reducido en ${amount.toFixed(2)} USDT para la orden inicial. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');
        
    } catch (error) {
        log(`Error CRÍTICO al colocar la primera orden: ${error.message}`, 'error');
        throw error; // 🛑 PROPAGAR EL ERROR PARA QUE EL LLAMADOR LO CAPTURE Y DETENGA EL FLUJO
    }
}


/**
 * Coloca una orden de compra de cobertura (a Mercado).
 * (Alineado con placeFirstBuyOrder para garantizar el bloqueo atómico y el manejo de errores).
 *
 * @param {object} botState - Estado completo del bot.
 * @param {number} usdtAmount - Cantidad de USDT a comprar.
 * @param {number} nextCoveragePrice - Precio objetivo (solo para logging/contexto, no se usa para la orden de mercado).
 * @param {function} log - Función de logging.
 * @param {function} updateGeneralBotState - Función para actualizar campos generales (lbalance/sbalance).
 * @param {function} updateBotState - Función para actualizar el estado del bot (lstate/sstate). 🛑 AGREGADO
 */
async function placeCoverageBuyOrder(botState, usdtAmount, nextCoveragePrice, log, updateGeneralBotState, updateBotState) { 
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    const currentLBalance = parseFloat(botState.lbalance || 0);
    
    // --- 1. VALIDACIÓN Y PRE-DEDUCCIÓN DEL BALANCE ---
    const newLBalance = currentLBalance - usdtAmount;
    
    if (usdtAmount < MIN_USDT_VALUE_FOR_BITMART) {
        log(`Error: La cantidad de cobertura (${usdtAmount.toFixed(2)} USDT) es menor al mínimo de BitMart ($${MIN_USDT_VALUE_FOR_BITMART}). Transicionando a NO_COVERAGE.`, 'error');
        await updateBotState('NO_COVERAGE', 'long'); 
        return;
    }
    
    if (newLBalance < 0) {
        log(`Error: Capital insuficiente para la orden de cobertura de ${usdtAmount.toFixed(2)} USDT. Transicionando a NO_COVERAGE.`, 'error');
        await updateBotState('NO_COVERAGE', 'long'); 
        return; // Detiene la ejecución
    }
    
    // Deducir lbalance antes de la colocación (CRÍTICO para la prevención de órdenes duplicadas)
    await updateGeneralBotState({ lbalance: newLBalance });
    log(`LBalance asignado reducido en ${usdtAmount.toFixed(2)} USDT para la orden de cobertura. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');


    log(`Colocando orden de cobertura a MERCADO por ${usdtAmount.toFixed(2)} USDT.`, 'info');
    
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtAmount); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;  

            // --- 2. ACTUALIZACIÓN ATÓMICA DE ESTADO PENDIENTE (BLOQUEO) ---
            const updateResult = await Autobot.findOneAndUpdate({}, { 
                $set: {
                    'lStateData.lastOrder': {
                        order_id: currentOrderId,
                        side: 'buy',
                        usdt_amount: usdtAmount,
                    },
                }
            }, { new: true });
            
            if (updateResult) {
                log(`Orden de cobertura colocada. ID: ${currentOrderId}. Bloqueo de ciclo activo.`, 'success');
                // El bot debe *permanecer* en BUYING para monitorear esta orden.
            } else {
                log(`Advertencia: Orden colocada (${currentOrderId}), pero no se pudo actualizar la DB. Revisar manualmente.`, 'error');
                // En caso de fallo de DB (raro), no revertimos el balance, la orden ya está activa
                // y la recuperación de DB la encontrará. Solo logeamos.
            }
            
        } else {
            log(`Error al colocar la orden de cobertura. Respuesta API: ${JSON.stringify(order)}`, 'error');
            // Revertir el balance pre-deducido
            const finalLBalance = newLBalance + usdtAmount;
            await updateGeneralBotState({ lbalance: finalLBalance });
            log(`Se revierte ${usdtAmount.toFixed(2)} USDT al balance (error de colocación).`, 'info');
            throw new Error(`Fallo en colocación de orden. ${JSON.stringify(order)}`); // 🛑 PROPAGAR ERROR
        }
    } catch (error) {
        log(`Error de API al colocar la orden de cobertura: ${error.message}`, 'error');
        // Revertir el balance pre-deducido 
        const finalLBalance = newLBalance + usdtAmount;
        await updateGeneralBotState({ lbalance: finalLBalance });
        log(`Se revierte ${usdtAmount.toFixed(2)} USDT al balance (error de API).`, 'info');
        throw error; // 🛑 PROPAGAR ERROR
    }
}

/**
 * Coloca una orden de venta a mercado.
 * (La llamada a getOrderDetail ha sido corregida para usar la variable 'creds' solo si es necesaria).
 */
async function placeSellOrder(config, creds, sellAmount, log, handleSuccessfulSell, botState, handlerDependencies) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    const amountToSell = parseFloat(sellAmount);

    log(`Colocando orden de venta a mercado por ${sellAmount.toFixed(8)} BTC.`, 'info');
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'SELL', 'market', amountToSell); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            log(`Orden de venta colocada. ID: ${currentOrderId}. Iniciando bloqueo y monitoreo en LSelling...`, 'success');
            
            // 1. Crear el objeto lastOrder de venta pendiente
            const sellLastOrder = {
                order_id: currentOrderId,
                price: botState.lStateData.ppc, 
                size: sellAmount,
                side: 'sell',
                state: 'pending_fill'
            };
            
            // 2. Persistir el lastOrder de forma atómica
            await Autobot.findOneAndUpdate({}, { 
                $set: { 'lStateData.lastOrder': sellLastOrder } 
            });

            // 3. LÓGICA DE VERIFICACIÓN INMEDIATA (Post-Orden de Mercado)
            try {
                await new Promise(resolve => setTimeout(resolve, 100)); 

                // 💡 CORRECCIÓN: Usamos la función getOrderDetail correctamente.
                const orderDetails = await bitmartService.getOrderDetail(creds, SYMBOL, currentOrderId); 
                
                const filledVolume = parseFloat(orderDetails.filled_volume || 0);

                if (filledVolume >= amountToSell * 0.999) { 
                    log(`Verificación: Orden ID ${currentOrderId} COMPLETADA (${filledVolume.toFixed(8)}/${amountToSell.toFixed(8)}).`, 'success');
                    
                    await handleSuccessfulSell(botState, orderDetails, handlerDependencies);
                    
                    await Autobot.findOneAndUpdate({}, { $set: { 'lStateData.lastOrder': null } });
                } else {
                    log(`Advertencia: Orden ID ${currentOrderId} no se llenó completamente (${filledVolume.toFixed(8)}). Permitiendo reintento.`, 'warning');
                }

            } catch (error) { 
                if (error.message.includes('50005')) {
                    log(`Advertencia: Orden ${currentOrderId} desapareció (llenado instantáneo). Asumiendo llenado.`, 'warning');
                    
                    await handleSuccessfulSell(botState, { filled_volume: botState.lStateData.ac, priceAvg: 0 }, handlerDependencies); 
                    await Autobot.findOneAndUpdate({}, { $set: { 'lStateData.lastOrder': null } });
                } else {
                    log(`Error al verificar la orden ${currentOrderId}: ${error.message}`, 'error');
                }
            } 
        } else { 
            log(`Error al colocar la orden de venta. Respuesta API: ${JSON.stringify(order)}`, 'error');
            throw new Error(`Fallo en colocación de orden. ${JSON.stringify(order)}`); // 🛑 PROPAGAR ERROR
        }
    } catch (error) { 
        log(`Error de API al colocar la orden: ${error.message}`, 'error');
        throw error; // 🛑 PROPAGAR ERROR
    }
}

/**
 * Cancela la última orden activa del bot.
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
        
        await Autobot.findOneAndUpdate({}, { $set: { 'lStateData.lastOrder': null } });

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