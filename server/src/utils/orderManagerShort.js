// BSB/server/src/utils/orderManagerShort.js (COMPLETO y CORREGIDO - Manejo seguro de órdenes)

const { placeOrder, getOrderDetail } = require('../../services/bitmartService');
const Autobot = require('../../models/Autobot');
const { handleSuccessfulSellShort, handleSuccessfulBuyToCoverShort } = require('./dataManagerShort'); 
// NOTA: dataManagerShort.js debe existir y exportar ambas funciones.

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
    
    // Aseguramos que los valores son numéricos
    const sellAmountBTC = parseFloat(config.short.sellBtc || 0); 
    const price = parseFloat(currentPrice || 0); 
    
    const SYMBOL = config.symbol || TRADE_SYMBOL;
    const estimatedUsdtNotional = sellAmountBTC * price;

    log(`Colocando la primera orden de VENTA en corto a mercado por ${sellAmountBTC.toFixed(8)} BTC.`, 'info');
    
    // Verificación de mínimo de BitMart (ya fue chequeada en SHRunning, pero se repite por seguridad)
    if (isNaN(estimatedUsdtNotional) || estimatedUsdtNotional < MIN_USDT_VALUE_FOR_BITMART || price === 0) {
         log(`Error: Monto inicial (${estimatedUsdtNotional.toFixed(2)} USDT) menor que el mínimo de BitMart o precio inválido.`, 'error');
         await updateBotState('RUNNING', 'short'); 
         return;
    }

    try {
        const order = await placeOrder(creds, SYMBOL, 'SELL', 'market', sellAmountBTC); 
        
        // 💡 CRÍTICO: Verificar que la orden devuelve un order_id válido
        if (order && order.order_id) {
            log(`Orden de VENTA colocada. ID: ${order.order_id}. Esperando confirmación...`, 'success');

            const currentOrderId = order.order_id;
            let botState = await Autobot.findOne({}); 

            if (botState) {
                // Pre-guardar el ID, size en BTC, y la estimación en USDT
                botState.sStateData.lastOrder = {
                    order_id: currentOrderId,
                    price: price, 
                    size: sellAmountBTC, 
                    usdt_amount: estimatedUsdtNotional, 
                    side: 'sell', 
                    state: 'pending_fill'
                };
                await Autobot.findOneAndUpdate({}, { 'sStateData': botState.sStateData });
            }
            
            // Inicia el monitoreo de la orden
            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, currentOrderId); 
                let updatedBotState = await Autobot.findOne({});

                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                        // Llama al dataManagerShort para actualizar AC, PPS, STP, etc.
                        await handleSuccessfulSellShort(updatedBotState, orderDetails, updateGeneralBotState); 
                    }
                } else {
                    log(`La orden inicial de venta ${currentOrderId} no se completó. Volviendo al estado RUNNING.`, 'error');
                    if (updatedBotState) {
                        // Limpiar el estado de orden pendiente
                        updatedBotState.sStateData.lastOrder = null;
                        updatedBotState.sStateData.orderCountInCycle = 0; 
                        await Autobot.findOneAndUpdate({}, { 'sStateData': updatedBotState.sStateData });
                        await updateBotState('RUNNING', 'short'); 
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {       
            // Si la API no devuelve ID válido o falla la respuesta
            log(`Error al colocar la primera orden de VENTA. Respuesta API: ${JSON.stringify(order)}`, 'error');
            await updateBotState('RUNNING', 'short'); 
        }
    } catch (error) {
        log(`Error de API al colocar la primera orden de VENTA: ${error.message}`, 'error');
        await updateBotState('RUNNING', 'short'); 
    }
}


/**
 * Coloca una orden de VENTA de cobertura a mercado (DCA para ir más corto).
 * @param {object} botState - Estado actual del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {number} sellAmountBTC - Cantidad de BTC a vender.
 * @param {number} nextCoveragePrice - Precio objetivo de esta cobertura (para cálculo nocional).
 * @param {function} log - Función de logging inyectada.
 * @param {function} updateBotState - Función para cambiar el estado inyectada.
 */
async function placeCoverageSellOrder(botState, creds, sellAmountBTC, nextCoveragePrice, log, updateBotState) {
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
        
    log(`Colocando orden de cobertura a MERCADO (SELL) por ${sellAmountBTC.toFixed(8)} BTC.`, 'info');
    
    try {
        const order = await placeOrder(creds, SYMBOL, 'SELL', 'market', sellAmountBTC); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;     

            const estimatedUsdtNotional = sellAmountBTC * nextCoveragePrice;

            botState.sStateData.lastOrder = {
                order_id: currentOrderId,
                price: nextCoveragePrice,   
                size: sellAmountBTC,   
                usdt_amount: estimatedUsdtNotional, 
                side: 'sell',
                state: 'pending_fill'
            };
            await Autobot.findOneAndUpdate({}, { 'sStateData': botState.sStateData });
            log(`Orden de cobertura colocada. ID: ${currentOrderId}. Esperando confirmación...`, 'success');

            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, currentOrderId);
                const updatedBotState = await Autobot.findOne({});
                
                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                        await handleSuccessfulSellShort(updatedBotState, orderDetails); 
                    }
                } else {
                    log(`La orden de cobertura ${currentOrderId} no se completó.`, 'error');
                    if (updatedBotState) {
                        updatedBotState.sStateData.lastOrder = null;
                        updatedBotState.sStateData.requiredCoverageAmount = 0; 
                        await Autobot.findOneAndUpdate({}, { 'sStateData': updatedBotState.sStateData });
                        await updateBotState('RUNNING', 'short');
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {
            log(`Error al colocar la orden de cobertura. Respuesta API: ${JSON.stringify(order)}`, 'error');
            // Limpiamos el estado de cobertura para reintentar en el próximo ciclo RUNNING
            botState.sStateData.requiredCoverageAmount = 0;
            await Autobot.findOneAndUpdate({}, { 'sStateData': botState.sStateData });
            await updateBotState('RUNNING', 'short');
        }
    } catch (error) {
        log(`Error de API al colocar la orden de cobertura: ${error.message}`, 'error');
        botState.sStateData.requiredCoverageAmount = 0;
        await Autobot.findOneAndUpdate({}, { 'sStateData': botState.sStateData });
        await updateBotState('RUNNING', 'short');
    }
}


/**
 * Coloca una orden de COMPRA a mercado para CUBRIR la posición en corto (cierre de ciclo).
 * @param {object} config - Configuración del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {number} coverAmount - Cantidad de BTC para cubrir.
 * @param {function} log - Función de logging inyectada.
 * @param {function} handleSuccessfulBuyToCover - Handler de dataManagerShort.js.
 * @param {object} botState - Estado actual del bot.
 * @param {object} handlerDependencies - Dependencias del handler (ej. updateGeneralBotState).
 */
async function placeBuyToCoverOrder(config, creds, coverAmount, log, handleSuccessfulBuyToCover, botState, handlerDependencies) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    log(`Colocando orden de COMPRA a mercado para CUBRIR por ${coverAmount.toFixed(8)} BTC.`, 'info');
    try {
        const order = await placeOrder(creds, SYMBOL, 'BUY', 'market', coverAmount); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            log(`Orden de cubrimiento colocada. ID: ${currentOrderId}. Esperando confirmación...`, 'success');
            
            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, currentOrderId);
                if (orderDetails && orderDetails.state === 'filled') {
                    // Llama al dataManagerShort para cerrar el ciclo, calcular profit y resetear
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