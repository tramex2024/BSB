// BSB/server/src/managers/shortOrderManager.js (Espejo de longOrderManager.js)

const Autobot = require('../../models/Autobot');
const bitmartService = require('../../services/bitmartService');
// 💡 Se asume que estos se moverán a tradeConstants.js o se crearán nuevos para SHORT
const { MIN_USDT_VALUE_FOR_BITMART, BUY_FEE_PERCENT, SELL_FEE_PERCENT, MIN_SELL_AMOUNT_BTC } = require('../utils/tradeConstants'); 

// =========================================================================
// FUNCIÓN 1: COLOCAR PRIMERA ORDEN DE VENTA (OPEN SHORT)
// =========================================================================

/**
 * Coloca la primera orden de venta a mercado (Apertura de Short).
 * @param {object} config - Configuración del bot.
 * @param {function} log - Función de logging.
 * @param {function} updateBotState - Función para actualizar el estado del bot (lstate/sstate).
 */
async function placeFirstSellOrder(config, log, updateBotState) {
    
    // 🛑 USAMOS short.purchaseBtc como la cantidad de BTC a vender
    const { purchaseBtc } = config.short; 
    const SYMBOL = config.symbol;
    const amountNominalBtc = parseFloat(purchaseBtc);
    
    // CÁLCULO DEL COSTO REAL (En BTC): Monto Nominal + Comisión (0.1%)
    // En la venta (Short), el 'costo' es el BTC que se bloquea del sbalance.
    // Usamos el fee de VENTA (SELL_FEE_PERCENT) para el cálculo de bloqueo de BTC
    const amountRealCostBtc = amountNominalBtc * (1 + SELL_FEE_PERCENT); // BTC a bloquear/gastar
    
    // A. Error: Monto menor al mínimo de BTC (asumiendo 0.00005 BTC)
    if (amountNominalBtc < MIN_SELL_AMOUNT_BTC) {
        log(`Error: La cantidad de venta (${amountNominalBtc} BTC) es menor al mínimo de BitMart. Cancelando.`, 'error');
        await updateBotState('NO_COVERAGE', 'short'); 
        return;
    }

    log(`Colocando la primera orden de VENTA a mercado por ${amountNominalBtc.toFixed(8)} BTC (Costo real: ${amountRealCostBtc.toFixed(8)} BTC).`, 'info'); 

    try {
        // 🛑 SIDE: 'sell' para abrir la posición Short
        const orderResult = await bitmartService.placeOrder(
            SYMBOL, 
            'sell', 
            'market', 
            amountNominalBtc, // Se envía el monto NOMINAL en BTC
            null 
        ); 

        const orderId = orderResult.order_id;
        log(`Orden de VENTA Short colocada. ID: ${orderId}. Iniciando bloqueo y monitoreo...`, 'info');

        // --- ACTUALIZACIÓN DE ESTADO Y BALANCE (Persistencia Atómica) ---
        
        const currentBotState = await Autobot.findOne({});
        if (!currentBotState) {
            log('Error: No se encontró el documento de Autobot para deducir el balance BTC.', 'error');
            throw new Error('Autobot document not found.');
        }

        const currentSBalance = parseFloat(currentBotState.sbalance || 0);
        // 🛑 Descontar el COSTO REAL (en BTC)
        const newSBalance = currentSBalance - amountRealCostBtc; 

        // ✅ Actualizar sbalance, lastOrder (en sStateData)
        await Autobot.findOneAndUpdate({}, {
            $set: {
                'sbalance': newSBalance, // 🛑 Saldo BTC deducido
                'sStateData.lastOrder': { // 🛑 Bloqueo en sStateData
                    order_id: orderId,
                    side: 'sell',
                    btc_amount: amountNominalBtc,
                    btc_cost_real: amountRealCostBtc, // NUEVO CAMPO (BTC bloqueado)
                }
            }
            
        });

        log(`SBalance asignado reducido en ${amountRealCostBtc.toFixed(8)} BTC (costo real). Nuevo balance: ${newSBalance.toFixed(8)} BTC.`, 'info');
        
    } catch (error) {
        log(`Error CRÍTICO al colocar la primera orden Short: ${error.message}`, 'error');
        throw error; 
    }
}

// =========================================================================
// FUNCIÓN 2: COLOCAR ORDEN DE COBERTURA (DCA VENTA SHORT)
// =========================================================================

/**
 * Coloca una orden de venta de cobertura (a Mercado).
 * @param {object} botState - Estado actual del bot.
 * @param {number} btcAmount - Cantidad de BTC a vender en la cobertura.
 */
async function placeCoverageSellOrder(botState, btcAmount, log, updateGeneralBotState, updateBotState) { 
    const SYMBOL = botState.config.symbol;
    const currentSBalance = parseFloat(botState.sbalance || 0);
    
    const amountNominalBtc = btcAmount;
    // CÁLCULO DEL COSTO REAL (En BTC): Monto Nominal + Comisión
    const amountRealCostBtc = amountNominalBtc * (1 + SELL_FEE_PERCENT);

    // --- 1. VALIDACIÓN Y PRE-DEDUCCIÓN DEL BALANCE ---
    
    if (amountNominalBtc < MIN_SELL_AMOUNT_BTC) {
        log(`Error: La cantidad de cobertura (${amountNominalBtc.toFixed(8)} BTC) es menor al mínimo de BitMart. Transicionando a NO_COVERAGE.`, 'error');
        await updateBotState('NO_COVERAGE', 'short'); 
        return;
    }
    
    // 🛑 Descontar el COSTO REAL (BTC) del balance.
    const newSBalance = currentSBalance - amountRealCostBtc; 

    if (newSBalance < 0) {
        log(`Error: Capital BTC insuficiente para la orden de cobertura de ${amountRealCostBtc.toFixed(8)} BTC (costo real). Transicionando a NO_COVERAGE.`, 'error');
        await updateBotState('NO_COVERAGE', 'short'); 
        return; // Detiene la ejecución
    }
    
    // Deducir sbalance antes de la colocación
    await updateGeneralBotState({ sbalance: newSBalance });
    log(`SBalance asignado reducido en ${amountRealCostBtc.toFixed(8)} BTC (costo real) para la orden de cobertura. Nuevo balance: ${newSBalance.toFixed(8)} BTC.`, 'info');


    log(`Colocando orden de VENTA de cobertura a MERCADO por ${amountNominalBtc.toFixed(8)} BTC.`, 'info');
    
    try {
        // 🛑 SIDE: 'sell'
        const order = await bitmartService.placeOrder(SYMBOL, 'sell', 'market', amountNominalBtc); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id; 

            // --- 2. ACTUALIZACIÓN ATÓMICA DE ESTADO PENDIENTE (BLOQUEO) ---
            const updateResult = await Autobot.findOneAndUpdate({}, { 
                $set: {
                    'sStateData.lastOrder': { // 🛑 Bloqueo en sStateData
                        order_id: currentOrderId,
                        side: 'sell',
                        btc_amount: amountNominalBtc,
                        btc_cost_real: amountRealCostBtc,
                    },
                }
            }, { new: true });
            
            if (updateResult) {
                log(`Orden de cobertura colocada. ID: ${currentOrderId}. Bloqueo de ciclo activo.`, 'success');
            } else {
                log(`Advertencia: Orden colocada (${currentOrderId}), pero no se pudo actualizar la DB. Revisar manualmente.`, 'error');
            }
            
        } else { 
            log(`Error al colocar la orden de cobertura. Respuesta API: ${JSON.stringify(order)}`, 'error');
            // 🛑 Revertir el COSTO REAL (BTC)
            const finalSBalance = newSBalance + amountRealCostBtc; 
            await updateGeneralBotState({ sbalance: finalSBalance });
            log(`Se revierte ${amountRealCostBtc.toFixed(8)} BTC (costo real) al balance (error de colocación).`, 'info');
            throw new Error(`Fallo en colocación de orden. ${JSON.stringify(order)}`); 
        }
    } catch (error) { 
        log(`Error de API al colocar la orden de cobertura: ${error.message}`, 'error');
        // 🛑 Revertir el COSTO REAL (BTC)
        const finalSBalance = newSBalance + amountRealCostBtc; 
        await updateGeneralBotState({ sbalance: finalSBalance });
        log(`Se revierte ${amountRealCostBtc.toFixed(8)} BTC (costo real) al balance (error de API).`, 'info');
        throw error; 
    }
}

// =========================================================================
// FUNCIÓN 3: COLOCAR ORDEN DE COMPRA (CIERRE SHORT / TAKE PROFIT)
// =========================================================================

/**
 * Coloca una orden de compra a mercado para cerrar el ciclo Short.
 * @param {number} buyAmountBtc - Cantidad de BTC a COMPRAR para cerrar la posición.
 * @param {function} handleSuccessfulBuyToCloseShort - Handler de éxito (del estado SBuying.js).
 */
async function placeBuyToCloseShort(config, creds, buyAmountBtc, log, handleSuccessfulBuyToCloseShort, botState, handlerDependencies) {
    const SYMBOL = config.symbol;
    const amountToBuy = parseFloat(buyAmountBtc);
    
    log(`Colocando orden de COMPRA a mercado para cerrar el Short por ${buyAmountBtc.toFixed(8)} BTC.`, 'info');
    try {
        // 🛑 SIDE: 'BUY' para cerrar el Short
        const order = await bitmartService.placeOrder(SYMBOL, 'BUY', 'market', amountToBuy); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            log(`Orden de COMPRA colocada. ID: ${currentOrderId}. Iniciando bloqueo y monitoreo en SBuying...`, 'success');
            
            // 1. Crear el objeto lastOrder de compra de cierre pendiente
            const buyLastOrder = {
                order_id: currentOrderId,
                price: botState.sStateData.ppc, 
                size: buyAmountBtc,
                side: 'buy', // 🛑 Side 'buy'
                state: 'pending_fill'
            };
            
            // 2. Persistir el lastOrder de forma atómica
            await Autobot.findOneAndUpdate({}, { 
                $set: { 'sStateData.lastOrder': buyLastOrder } // 🛑 sStateData
            });

            // 3. LÓGICA DE VERIFICACIÓN INMEDIATA (Post-Orden de Mercado)
            try {
                await new Promise(resolve => setTimeout(resolve, 100)); 

                const orderDetails = await bitmartService.getOrderDetail(creds, SYMBOL, currentOrderId); 
                
                const filledVolume = parseFloat(orderDetails.filled_volume || 0);

                if (filledVolume >= amountToBuy * 0.999) { 
                    log(`Verificación: Orden ID ${currentOrderId} COMPLETADA (${filledVolume.toFixed(8)}/${amountToBuy.toFixed(8)}).`, 'success');
                    
                    // 🛑 Llama al handler del Short para el cierre y cálculo final
                    await handleSuccessfulBuyToCloseShort(botState, orderDetails, handlerDependencies); 
                    
                    await Autobot.findOneAndUpdate({}, { $set: { 'sStateData.lastOrder': null } });
                } else {
                    log(`Advertencia: Orden ID ${currentOrderId} no se llenó completamente (${filledVolume.toFixed(8)}). Permitiendo reintento.`, 'warning');
                }

            } catch (error) { 
                if (error.message.includes('50005')) {
                    log(`Advertencia: Orden ${currentOrderId} desapareció (llenado instantáneo). Asumiendo llenado.`, 'warning');
                    
                    // 🛑 Llama al handler del Short asumiendo el llenado
                    await handleSuccessfulBuyToCloseShort(botState, { filled_volume: botState.sStateData.ac, priceAvg: 0 }, handlerDependencies); 
                    await Autobot.findOneAndUpdate({}, { $set: { 'sStateData.lastOrder': null } });
                } else {
                    log(`Error al verificar la orden ${currentOrderId}: ${error.message}`, 'error');
                }
            } 
        } else { 
            log(`Error al colocar la orden de COMPRA de cierre. Respuesta API: ${JSON.stringify(order)}`, 'error');
            throw new Error(`Fallo en colocación de orden. ${JSON.stringify(order)}`); 
        }
    } catch (error) { 
        log(`Error de API al colocar la orden: ${error.message}`, 'error');
        throw error; 
    }
}

// =========================================================================
// FUNCIÓN 4: CANCELACIÓN
// =========================================================================

/**
 * Cancela la última orden activa del bot (Solo Short).
 */
async function cancelActiveShortOrder(botState, log) {
    if (!botState.sStateData.lastOrder || !botState.sStateData.lastOrder.order_id) {
        log("No hay una orden Short para cancelar registrada.", 'info');
        return;
    }

    const SYMBOL = botState.config.symbol;
    const orderId = botState.sStateData.lastOrder.order_id;
    
    try {
        log(`Intentando cancelar orden Short ID: ${orderId}...`, 'warning');
        
        const result = await bitmartService.cancelOrder(SYMBOL, orderId); 
        
        if (result && result.code === 1000) {
            log(`Orden Short ${orderId} cancelada exitosamente.`, 'success');
        } else {
            log(`No se pudo cancelar la orden Short ${orderId}. Razón: ${JSON.stringify(result)}`, 'error');
        }
        
        await Autobot.findOneAndUpdate({}, { $set: { 'sStateData.lastOrder': null } });

    } catch (error) {
        log(`Error de API al intentar cancelar la orden ${orderId}: ${error.message}`, 'error');
    }
}

module.exports = {
    placeFirstSellOrder,
    placeCoverageSellOrder,
    placeBuyToCloseShort,
    cancelActiveShortOrder
};