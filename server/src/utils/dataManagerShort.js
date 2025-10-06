// BSB/server/src/utils/orderManagerShort.js (CORREGIDO - Manejo de errores, guardado de lastOrder y recuperación de fallos)

const { placeOrder, getOrderDetail } = require('../../services/bitmartService');
const Autobot = require('../../models/Autobot');
const { handleSuccessfulSellShort, handleSuccessfulBuyToCoverShort } = require('./dataManagerShort'); 
const MIN_USDT_VALUE_FOR_BITMART = 5.00;
const ORDER_CHECK_TIMEOUT_MS = 2000;
const TRADE_SYMBOL = 'BTC_USDT';

/**
 * Coloca la primera orden de VENTA a mercado (Entrada inicial en corto).
 * @param {object} config - Configuración del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {function} log - Función de logging inyectada.
 * @param {function} updateBotState - Función para cambiar el estado inyectada.
 * @param {function} updateGeneralBotState - Función para actualizar SBalance inyectada.
 * @param {number} currentPrice - Precio actual para estimar el valor en USDT.
 */
async function placeFirstSellOrder(config, creds, log, updateBotState, updateGeneralBotState, currentPrice) {
    const sellAmountBTC = parseFloat(config.short.sellBtc); // Cantidad en BTC
    const SYMBOL = config.symbol || TRADE_SYMBOL;
    const estimatedUsdtNotional = sellAmountBTC * currentPrice;

    log(`Colocando la primera orden de VENTA en corto a mercado por ${sellAmountBTC.toFixed(8)} BTC.`, 'info');
    
    // Verificación de mínimo de BitMart
    if (estimatedUsdtNotional < MIN_USDT_VALUE_FOR_BITMART) {
         log(`Error: Monto inicial (${estimatedUsdtNotional.toFixed(2)} USDT) menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART}).`, 'error');
         await updateBotState('RUNNING', 'short'); 
         return;
    }

    try {
        const order = await placeOrder(creds, SYMBOL, 'SELL', 'market', sellAmountBTC); 
        
        // 💡 CORRECCIÓN CRÍTICA: SOLO CONTINUAR SI LA ORDEN TIENE ID
        if (order && order.order_id) {
            log(`Orden de VENTA colocada. ID: ${order.order_id}. Esperando confirmación...`, 'success');

            const currentOrderId = order.order_id;
            let botState = await Autobot.findOne({}); 

            if (botState) {
                // Pre-guardar el ID, size en BTC, y la estimación en USDT para el DCA
                botState.sStateData.lastOrder = {
                    order_id: currentOrderId,
                    price: currentPrice, // Usamos el precio actual como referencia
                    size: sellAmountBTC, 
                    usdt_amount: estimatedUsdtNotional, 
                    side: 'sell', 
                    state: 'pending_fill'
                };
                // 💡 CRÍTICO: Guardamos el estado inmediatamente para bloquear duplicados
                await Autobot.findOneAndUpdate({}, { 'sStateData': botState.sStateData });
            }
            
            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, currentOrderId); 
                let updatedBotState = await Autobot.findOne({});

                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                        await handleSuccessfulSellShort(updatedBotState, orderDetails, updateGeneralBotState); 
                    }
                } else {
                    log(`La orden inicial de venta ${currentOrderId} no se completó. Volviendo al estado RUNNING.`, 'error');
                    if (updatedBotState) {
                        updatedBotState.sStateData.lastOrder = null;
                        updatedBotState.sStateData.orderCountInCycle = 0; 
                        await Autobot.findOneAndUpdate({}, { 'sStateData': updatedBotState.sStateData });
                        await updateBotState('RUNNING', 'short'); 
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {       
            log(`Error al colocar la primera orden de VENTA. Respuesta API: ${JSON.stringify(order)}`, 'error');
            await updateBotState('RUNNING', 'short'); // Si falla la API, restaurar el estado
        }
    } catch (error) {
        log(`Error de API al colocar la primera orden de VENTA: ${error.message}`, 'error');
        await updateBotState('RUNNING', 'short'); // Si falla la excepción, restaurar el estado
    }
}


/**
 * Coloca una orden de VENTA de cobertura (Market Sell Order para ir más corto).
 * @param {object} botState - Estado actual del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {number} sellAmountBTC - Cantidad de BTC para la orden.
 * @param {number} nextCoveragePrice - Precio de disparo (solo para referencia).
 * @param {function} log - Función de logging inyectada.
 * @param {function} updateBotState - Función para cambiar el estado inyectada.
 */
async function placeCoverageSellOrder(botState, creds, sellAmountBTC, nextCoveragePrice, log, updateBotState) {
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
    
    // NOTA: requiredCoverageAmount ya se restó del SBalance en coverageLogicShort.js antes de llamar aquí.
    
    log(`Colocando orden de cobertura a MERCADO (SELL) por ${sellAmountBTC.toFixed(8)} BTC.`, 'info');
    
    try {
        const order = await placeOrder(creds, SYMBOL, 'SELL', 'market', sellAmountBTC); 

        // 💡 CORRECCIÓN CRÍTICA: SOLO CONTINUAR SI LA ORDEN TIENE ID
        if (order && order.order_id) {
            const currentOrderId = order.order_id;     

            // Usamos el precio de cobertura para estimar el Notional (para DCA en dataManagerShort)
            const estimatedUsdtNotional = sellAmountBTC * nextCoveragePrice;

            botState.sStateData.lastOrder = {
                order_id: currentOrderId,
                price: nextCoveragePrice,   
                size: sellAmountBTC,   
                usdt_amount: estimatedUsdtNotional, 
                side: 'sell',
                state: 'pending_fill'
            };
            // 💡 CRÍTICO: Guardamos el estado inmediatamente para bloquear duplicados en coverageLogicShort.
            await Autobot.findOneAndUpdate({}, { 'sStateData': botState.sStateData });
            log(`Orden de cobertura colocada. ID: ${currentOrderId}. Esperando confirmación...`, 'success');

            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, currentOrderId);
                const updatedBotState = await Autobot.findOne({});
                
                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                        // handleSuccessfulSellShort manejará la reducción del SBalance y el DCA
                        // Aquí no se toca el SBalance, ya se hizo antes de la llamada.
                        await handleSuccessfulSellShort(updatedBotState, orderDetails); 
                    }
                } else {
                    log(`La orden de cobertura ${currentOrderId} no se completó.`, 'error');
                    if (updatedBotState) {
                        // Limpiamos lastOrder y volvemos a RUNNING para reevaluar.
                        updatedBotState.sStateData.lastOrder = null;
                        updatedBotState.sStateData.requiredCoverageAmount = 0; // Limpiamos el monto requerido
                        await Autobot.findOneAndUpdate({}, { 'sStateData': updatedBotState.sStateData });
                        // La lógica de reversión del SBalance se debe hacer en coverageLogicShort.js si la orden falla,
                        // pero por seguridad, volvemos a RUNNING aquí.
                        await updateBotState('RUNNING', 'short');
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {
            log(`Error al colocar la orden de cobertura. Respuesta API: ${JSON.stringify(order)}`, 'error');
            // 💡 CRÍTICO: Si la orden falló en la API, debemos limpiar requiredCoverageAmount y volver a RUNNING.
            // La reversión del SBalance debe ocurrir en coverageLogicShort.js
            botState.sStateData.requiredCoverageAmount = 0;
            await Autobot.findOneAndUpdate({}, { 'sStateData': botState.sStateData });
            await updateBotState('RUNNING', 'short');
        }
    } catch (error) {
        log(`Error de API al colocar la orden de cobertura: ${error.message}`, 'error');
        // 💡 CRÍTICO: Si hay una excepción, debemos limpiar requiredCoverageAmount y volver a RUNNING.
        botState.sStateData.requiredCoverageAmount = 0;
        await Autobot.findOneAndUpdate({}, { 'sStateData': botState.sStateData });
        await updateBotState('RUNNING', 'short');
    }
}


/**
 * Coloca una orden de COMPRA a mercado para CUBRIR la posición en corto (cierre de ciclo).
 * @param {object} config - Configuración del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {number} coverAmount - Cantidad de BTC para la orden.
 * @param {function} log - Función de logging inyectada.
 * @param {function} handleSuccessfulBuyToCover - Función de callback para manejar el éxito.
 * @param {object} botState - Estado actual del bot (para pasar al handler).
 * @param {object} handlerDependencies - Dependencias necesarias para el handler.
 */
async function placeBuyToCoverOrder(config, creds, coverAmount, log, handleSuccessfulBuyToCover, botState, handlerDependencies) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    log(`Colocando orden de COMPRA a mercado para CUBRIR por ${coverAmount.toFixed(8)} BTC.`, 'info');
    try {
        // CRÍTICO: Usamos 'BUY' para cubrir la posición en corto (Market Order by Quantity)
        const order = await placeOrder(creds, SYMBOL, 'BUY', 'market', coverAmount); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            log(`Orden de cubrimiento colocada. ID: ${currentOrderId}. Esperando confirmación...`, 'success');

            // 💡 NOTA: No es necesario guardar lastOrder aquí, ya que SHSelling no tiene un loop que cause duplicación.
            
            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, currentOrderId);
                if (orderDetails && orderDetails.state === 'filled') {
                    // 💡 CORRECCIÓN: Usamos el estado que recibimos como base.
                    await handleSuccessfulBuyToCover(botState, orderDetails, handlerDependencies); 
                } else {
                    log(`La orden de cubrimiento ${currentOrderId} no se completó.`, 'error');
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {
            log(`Error al colocar la orden de cubrimiento. Respuesta API: ${JSON.stringify(order)}`, 'error');
        }
    } catch (error) {
        log(`Error de API al colocar la orden de cubrimiento: ${error.message}`, 'error');
    }
}

module.exports = {
    placeFirstSellOrder,
    placeCoverageSellOrder,
    placeBuyToCoverOrder,
    MIN_USDT_VALUE_FOR_BITMART
};