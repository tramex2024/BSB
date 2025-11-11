// BSB/server/src/managers/longOrderManager.js

const Autobot = require('../../models/Autobot');
const bitmartService = require('../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART, BUY_FEE_PERCENT } = require('../utils/tradeConstants');

/**
 * Coloca la primera orden de compra (o inicial).
 * @param {object} config - Configuración del bot.
 * @param {object} botState - Estado actual del bot (para lbalance).
 * @param {function} log - Función de logging.
 * @param {function} updateBotState - Función para actualizar el estado del bot (lstate/sstate).
 * @param {function} updateGeneralBotState - Función para actualizar campos generales (balance).
 */
async function placeFirstBuyOrder(config, botState, log, updateBotState, updateGeneralBotState) { // 🛑 FIRMA CORREGIDA
    
    const { purchaseUsdt } = config.long;
    const SYMBOL = config.symbol;
    const amountNominal = parseFloat(purchaseUsdt);
    
    // CÁLCULO DEL COSTO REAL: Monto Nominal + Comisión (0.1%)
    const amountRealCost = amountNominal * (1 + BUY_FEE_PERCENT);

    // A. Error: Monto menor al mínimo
    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`Error: La cantidad de compra es menor al mínimo de BitMart ($${MIN_USDT_VALUE_FOR_BITMART}). Cancelando.`, 'error');
        await updateBotState('NO_COVERAGE', 'long'); 
        return;
    }
    
    // 🛑 USAR el botState que se pasó como argumento
    const currentLBalance = parseFloat(botState.lbalance || 0);
    const newLBalance = currentLBalance - amountRealCost;

    log(`Colocando la primera orden de compra a mercado por ${amountNominal.toFixed(2)} USDT (Costo real: ${amountRealCost.toFixed(2)} USDT).`, 'info'); 

    try {
        const orderResult = await bitmartService.placeOrder(
            SYMBOL, 
            'buy', 
            'market', 
            amountNominal, // Se envía el monto NOMINAL
            null 
        ); 

        const orderId = orderResult.order_id;
        log(`Orden de compra colocada. ID: ${orderId}. Iniciando bloqueo y monitoreo...`, 'info');

        // --- ACTUALIZACIÓN DE ESTADO Y BALANCE (Persistencia Atómica) ---
        // 🛑 Lógica de búsqueda de balance eliminada. Usamos el newLBalance calculado.

        // ✅ Actualizar lbalance, lastOrder
        // Usamos Autobot.findOneAndUpdate directamente ya que es una operación atómica
        // y evita la carrera con el ciclo principal.
        await Autobot.findOneAndUpdate({}, {
            $set: {
                'lbalance': newLBalance,
                'lStateData.lastOrder': {
                    order_id: orderId,
                    side: 'buy',
                    usdt_amount: amountNominal,
                    usdt_cost_real: amountRealCost,
                }
            }
        });

        log(`LBalance asignado reducido en ${amountRealCost.toFixed(2)} USDT (costo real). Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');
        
    } catch (error) {
        log(`Error CRÍTICO al colocar la primera orden: ${error.message}`, 'error');
        throw error; // PROPAGAR EL ERROR PARA QUE EL LLAMADOR LO CAPTURE Y DETENGA EL FLUJO
    }
}


/**
 * Coloca una orden de compra de cobertura (a Mercado) usando un BLOQUEO TEMPORAL.
 * Esto previene la carrera de órdenes al bloquear lStateData.lastOrder ANTES de la llamada a la API.
 */
async function placeCoverageBuyOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState) { 
    const SYMBOL = botState.config.symbol;
    const currentLBalance = parseFloat(botState.lbalance || 0);
    
    const amountNominal = usdtAmount;
    // CÁLCULO DEL COSTO REAL: Monto Nominal + Comisión (0.1%)
    const amountRealCost = amountNominal * (1 + BUY_FEE_PERCENT);

    // --- 1. VALIDACIÓN Y PRE-DEDUCCIÓN DEL BALANCE ---
    
    if (amountNominal < MIN_USDT_VALUE_FOR_BITMART) {
        log(`Error: La cantidad de cobertura (${amountNominal.toFixed(2)} USDT) es menor al mínimo de BitMart. Transicionando a NO_COVERAGE.`, 'error');
        await updateBotState('NO_COVERAGE', 'long'); 
        return;
    }
    
    const newLBalance = currentLBalance - amountRealCost; 

    if (newLBalance < 0) {
        log(`Error: Capital insuficiente para la orden de cobertura de ${amountRealCost.toFixed(2)} USDT (costo real). Transicionando a NO_COVERAGE.`, 'error');
        await updateBotState('NO_COVERAGE', 'long'); 
        return; // Detiene la ejecución
    }
    
    // Deducir lbalance antes de la colocación
    await updateGeneralBotState({ lbalance: newLBalance });
    log(`LBalance asignado reducido en ${amountRealCost.toFixed(2)} USDT (costo real) para la orden de cobertura. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');

    // --- 2. BLOQUEO TEMPORAL CRÍTICO (Anti-Carrera) ---
    // Colocamos un 'lastOrder' temporal para que si otro ciclo arranca, vea que ya hay una orden pendiente.
    const tempOrderId = `BLOCK_${Date.now()}`;
    const tempOrderObject = { order_id: tempOrderId, side: 'buy', usdt_amount: amountNominal };
    await Autobot.findOneAndUpdate({}, { $set: { 'lStateData.lastOrder': tempOrderObject } });
    log(`¡BLOQUEO TEMPORAL '${tempOrderId}' ACTIVO! Ciclo concurrente bloqueado.`, 'warning');
    
    log(`Colocando orden de cobertura a MERCADO por ${amountNominal.toFixed(2)} USDT.`, 'info');
    
    try {
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', amountNominal); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id; 

            // --- 3. REEMPLAZO DEL BLOQUEO TEMPORAL CON EL ID REAL ---
            const updateResult = await Autobot.findOneAndUpdate({}, { 
                $set: {
                    'lStateData.lastOrder': {
                        order_id: currentOrderId,
                        side: 'buy',
                        usdt_amount: amountNominal,
                        usdt_cost_real: amountRealCost, 
                    },
                }
            }, { new: true });
            
            if (updateResult) {
                log(`Orden de cobertura colocada. ID: ${currentOrderId}. Bloqueo de ciclo actualizado.`, 'success');
            } else {
                log(`Advertencia: Orden colocada (${currentOrderId}), pero no se pudo actualizar la DB. Revisar manualmente.`, 'error');
            }
            
        } else { 
            log(`Error al colocar la orden de cobertura. Respuesta API: ${JSON.stringify(order)}`, 'error');
            
            // 🛑 Revertir el COSTO REAL y LIMPIAR EL BLOQUEO
            await Autobot.findOneAndUpdate({}, { $set: { 'lStateData.lastOrder': null } });
            const finalLBalance = newLBalance + amountRealCost; 
            await updateGeneralBotState({ lbalance: finalLBalance });
            log(`Se revierte ${amountRealCost.toFixed(2)} USDT (costo real) al balance (error de colocación).`, 'info');
            throw new Error(`Fallo en colocación de orden. ${JSON.stringify(order)}`); // PROPAGAR ERROR
        }
    } catch (error) {
        log(`Error de API al colocar la orden de cobertura: ${error.message}`, 'error');
        
        // 🛑 Revertir el COSTO REAL y LIMPIAR EL BLOQUEO
        await Autobot.findOneAndUpdate({}, { $set: { 'lStateData.lastOrder': null } });
        const finalLBalance = newLBalance + amountRealCost; 
        await updateGeneralBotState({ lbalance: finalLBalance });
        log(`Se revierte ${amountRealCost.toFixed(2)} USDT (costo real) al balance (error de API).`, 'info');
        throw error; // PROPAGAR ERROR
    }
}

/**
 * Coloca una orden de venta a mercado para cerrar el ciclo Long.
 */
// 🛑 FIRMA SIMPLIFICADA (Eliminamos creds, handleSuccessfulSell, handlerDependencies)
async function placeSellOrder(config, botState, sellAmount, log) { 
    const SYMBOL = config.symbol;
    const amountToSell = parseFloat(sellAmount);

    log(`Colocando orden de venta a mercado por ${sellAmount.toFixed(8)} BTC.`, 'info');
    try {
        // 🛑 Nota: Aquí asumo que la función placeOrder en BitMartService no necesita `creds` explícitamente, 
        // ya que la autenticación está en el servicio. Si lo necesita, la firma debe incluir `creds`.
        const order = await bitmartService.placeOrder(SYMBOL, 'SELL', 'market', amountToSell); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            log(`Orden de venta colocada. ID: ${currentOrderId}. Iniciando bloqueo en LSelling...`, 'success');
            
            // 1. Crear el objeto lastOrder de venta pendiente
            const sellLastOrder = {
                order_id: currentOrderId,
                // price: botState.lStateData.ppc, // Se puede dejar o eliminar, el precio real será el llenado.
                size: sellAmount,
                side: 'sell',
                state: 'pending_fill' // 🛑 state: 'pending_fill' es crucial para el Consolidator
            };
            
            // 2. Persistir el lastOrder de forma atómica (BLOQUEO)
            await Autobot.findOneAndUpdate({}, { 
                $set: { 'lStateData.lastOrder': sellLastOrder } 
            });

            // 🛑 LÓGICA DE VERIFICACIÓN INMEDIATA (Post-Orden de Mercado) ELIMINADA. 
            // Esta tarea se traslada al Consolidator o a LSelling.js para evitar errores de carrera.

        } else { 
            log(`Error al colocar la orden de venta. Respuesta API: ${JSON.stringify(order)}`, 'error');
            throw new Error(`Fallo en colocación de orden. ${JSON.stringify(order)}`); // PROPAGAR ERROR
        }
    } catch (error) { 
        log(`Error de API al colocar la orden: ${error.message}`, 'error');
        throw error; // PROPAGAR ERROR
    }
}

/**
 * Cancela la última orden activa del bot (Solo Long).
 */
async function cancelActiveLongOrder(botState, log) {
    if (!botState.lStateData.lastOrder || !botState.lStateData.lastOrder.order_id) {
        log("No hay una orden Long para cancelar registrada.", 'info');
        return;
    }

    const SYMBOL = botState.config.symbol;
    const orderId = botState.lStateData.lastOrder.order_id;
    
    try {
        log(`Intentando cancelar orden Long ID: ${orderId}...`, 'warning');
        
        const result = await bitmartService.cancelOrder(SYMBOL, orderId); 
        
        if (result && result.code === 1000) {
            log(`Orden Long ${orderId} cancelada exitosamente.`, 'success');
        } else {
            log(`No se pudo cancelar la orden Long ${orderId}. Razón: ${JSON.stringify(result)}`, 'error');
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
    cancelActiveLongOrder
};