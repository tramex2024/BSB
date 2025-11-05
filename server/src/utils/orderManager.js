// BSB/server/src/utils/orderManager.js (CORREGIDO: Elimina bloqueo de estado RUNNING)

const Autobot = require('../../models/Autobot');
const bitmartService = require('../../services/bitmartService'); 

const TRADE_SYMBOL = 'BTC_USDT';
const MIN_USDT_VALUE_FOR_BITMART = 5.00;

/**
 * Coloca la primera orden de compra (o inicial).
 * * @param {object} config - Configuración del bot.
 * @param {function} log - Función de logging.
 * @param {function} updateBotState - Función para actualizar el estado del bot (lstate/sstate).
 * @param {function} updateGeneralBotState - Función para actualizar campos generales (lbalance/sbalance).
 */
async function placeFirstBuyOrder(config, log, updateBotState, updateGeneralBotState) {
    
    // 🛑 BLOQUE ELIMINADO: Ya no es necesario el bloqueo atómico que verifica RUNNING,
    // ya que la orden se gestiona desde el estado BUYING y LBuying.js garantiza
    // que la posición esté limpia antes de llamar.
    
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

        // ✅ CORRECCIÓN FINAL: Actualizar lbalance, lastOrder E INCREMENTAR orderCountInCycle
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
                'lStateData.orderCountInCycle': 1 
            }
        });

        log(`LBalance asignado reducido en ${amount.toFixed(2)} USDT para la orden inicial. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');
        
    } catch (error) {
        log(`Error CRÍTICO al colocar la primera orden: ${error.message}`, 'error');
        
        // 🛑 CORRECCIÓN: Eliminamos la línea innecesaria que intenta actualizar el estado a BUYING,
        // ya que el estado ya es BUYING.
    }
}


/**
 * Coloca una orden de compra de cobertura (a Mercado).
 * (Lógica de nextCoveragePrice eliminada aquí, ya que LBuying.js lo calcula tras la consolidación).
 */
async function placeCoverageBuyOrder(botState, usdtAmount, nextCoveragePrice, log, updateGeneralBotState) { 
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    const currentLBalance = parseFloat(botState.lbalance || 0);
    
    // --- CÁLCULO DE LA PRÓXIMA COBERTURA (Progresión Geométrica) ---
    // 💡 NOTA: Mantenemos la variable 'nextOrderAmount' para evitar romper el flujo
    // pero su persistencia se elimina, ya que LBuying.js lo hará.
    const sizeVariance = botState.config.long.size_var / 100;
    const nextOrderAmount = usdtAmount * (1 + sizeVariance); 

    // --- PRE-DEDUCCIÓN DEL BALANCE ---
    const newLBalance = currentLBalance - usdtAmount;
    if (newLBalance < 0) {
        log(`Error: Capital insuficiente para la orden de cobertura de ${usdtAmount.toFixed(2)} USDT. Transicionando a NO_COVERAGE.`, 'error');
        
        // 💡 CORRECCIÓN: Debemos asegurarnos de tener updateBotState para la transición
        const { updateBotState } = require('./dataManager'); // Asumiendo que se exporta en dataManager.js
        await updateBotState('NO_COVERAGE', 'long'); 
        
        return; // Detiene la ejecución
    }
    
    // Deducir lbalance antes de la colocación 
    await updateGeneralBotState({ lbalance: newLBalance });
    log(`LBalance asignado reducido en ${usdtAmount.toFixed(2)} USDT para la orden de cobertura. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');


    log(`Colocando orden de cobertura a MERCADO por ${usdtAmount.toFixed(2)} USDT.`, 'info');
    
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', usdtAmount); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;  

            // --- 2. ACTUALIZACIÓN ATÓMICA DE ESTADO PENDIENTE ---
            const updateResult = await Autobot.findOneAndUpdate({}, { 
                $set: {
                    'lStateData.lastOrder': {
                        order_id: currentOrderId,
                        side: 'buy',
                        usdt_amount: usdtAmount,
                    },
                    // 🛑 ELIMINADA PERSISTENCIA DE nextOrderAmount: La consolidación lo calcula y guarda
                    // 'lStateData.requiredCoverageAmount': nextOrderAmount
                }
            }, { new: true });
            
            if (updateResult) {
                log(`Orden de cobertura colocada. ID: ${currentOrderId}.`, 'success');
            } else {
                log(`Advertencia: Orden colocada (${currentOrderId}), pero no se pudo actualizar la DB. Revisar manualmente.`, 'error');
            }
            
        } else {
            log(`Error al colocar la orden de cobertura. Respuesta API: ${JSON.stringify(order)}`, 'error');
            
            // Revertir el balance pre-deducido
            const finalLBalance = newLBalance + usdtAmount;
            await updateGeneralBotState({ lbalance: finalLBalance });
            log(`Se revierte ${usdtAmount.toFixed(2)} USDT al balance (error de colocación).`, 'info');
        }
    } catch (error) {
        log(`Error de API al colocar la orden de cobertura: ${error.message}`, 'error');
        // Revertir el balance pre-deducido 
        const finalLBalance = newLBalance + usdtAmount;
        await updateGeneralBotState({ lbalance: finalLBalance });
        log(`Se revierte ${usdtAmount.toFixed(2)} USDT al balance (error de API).`, 'info');
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
        }
    } catch (error) { 
        log(`Error de API al colocar la orden: ${error.message}`, 'error');
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