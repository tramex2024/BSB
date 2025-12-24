// BSB/server/src/au/managers/longOrderManager.js

const Autobot = require('../../../models/Autobot');
const bitmartService = require('../../../services/bitmartService');
const { MIN_USDT_VALUE_FOR_BITMART, BUY_FEE_PERCENT } = require('../utils/tradeConstants');

/**
 * Coloca la primera orden de compra (o inicial).
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

        // ✅ Actualizar lbalance, lastOrder
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


async function placeCoverageBuyOrder(botState, usdtAmount, log, updateGeneralBotState, updateBotState) { 
    const SYMBOL = botState.config.symbol;
    const currentLBalance = parseFloat(botState.lbalance || 0);
    
    const amountNominal = usdtAmount;
    // CÁLCULO DEL COSTO REAL: Monto Nominal + Comisión (0.1%)
    const amountRealCost = amountNominal * (1 + BUY_FEE_PERCENT);

    // --- 1. VALIDACIÓN Y CÁLCULO DE BALANCE ---
    
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
    
    log(`Colocando orden de cobertura a MERCADO por ${amountNominal.toFixed(2)} USDT.`, 'info');
    
    try {
        // --- 2. COLOCACIÓN DE ORDEN (Aquí es donde ocurre la latencia) ---
        const order = await bitmartService.placeOrder(SYMBOL, 'buy', 'market', amountNominal); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id; 

            // --- 3. ACTUALIZACIÓN ATÓMICA DE ESTADO Y BALANCE (Anti-Carrera) ---
            // Aquí se bloquea la orden de la carrera Y se deduce el saldo en una operación.
            const updateResult = await Autobot.findOneAndUpdate({}, { 
                $set: {
                    'lbalance': newLBalance, // ⬅️ DEDUCCIÓN ATÓMICA AQUÍ
                    'lStateData.lastOrder': { // ⬅️ BLOQUEO ATÓMICO AQUÍ
                        order_id: currentOrderId,
                        side: 'buy',
                        usdt_amount: amountNominal,
                        usdt_cost_real: amountRealCost, 
                    },
                }
            }, { new: true });
            
            if (updateResult) {
                log(`Orden de cobertura colocada. ID: ${currentOrderId}. Balance y bloqueo actualizados ATÓMICAMENTE.`, 'success');
            } else {
                // Esto es un fallo grave, la orden se colocó pero el estado no se actualizó
                log(`Advertencia: Orden colocada (${currentOrderId}), pero NO se pudo actualizar la DB. Esto puede causar órdenes en carrera o errores de balance.`, 'error');
            }
            
        } else { 
            // --- 4. FALLO EN LA API (La orden no se colocó) ---
            log(`Error al colocar la orden de cobertura. Respuesta API: ${JSON.stringify(order)}`, 'error');
            throw new Error(`Fallo en colocación de orden. ${JSON.stringify(order)}`); // PROPAGAR ERROR
        }
    } catch (error) {
        // --- 5. FALLO DE CONEXIÓN O EXCEPCIÓN ---
        log(`Error de API al colocar la orden de cobertura: ${error.message}`, 'error');
        throw error; // PROPAGAR ERROR
    }
}

/**
 * Coloca una orden de venta a mercado para cerrar el ciclo Long.
 * Implementa el BLOQUEO ATÓMICO: Asigna lStateData.lastOrder después de colocar la orden.
 */
async function placeSellOrder(config, botState, sellAmount, log) { 
    const SYMBOL = config.symbol;
    const amountToSell = parseFloat(sellAmount);

    log(`Colocando orden de venta a mercado por ${sellAmount.toFixed(8)} BTC.`, 'info');
    try {
        // 💡 CORRECCIÓN: Cambiar 'SELL' a 'sell' por consistencia con 'buy'
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', amountToSell); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            log(`Orden de venta colocada. ID: ${currentOrderId}. Iniciando bloqueo en LSelling...`, 'success');
            
            // --- BLOQUEO ATÓMICO CRÍTICO ---
            // 1. Crear el objeto lastOrder de venta pendiente
            const sellLastOrder = {
                order_id: currentOrderId,
                size: sellAmount,
                side: 'sell',
                // 💡 LIMPIEZA: Eliminar state: 'pending_fill'. Solo necesitamos order_id y side.
            };
            
            // 2. Persistir el lastOrder de forma atómica (BLOQUEO)
            await Autobot.findOneAndUpdate({}, { 
                $set: { 'lStateData.lastOrder': sellLastOrder } 
            });
            // ------------------------------------

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