// BSB/server/src/utils/orderManager.js (COMPLETO y CORREGIDO - Manejo seguro de órdenes para LONG)

const { placeOrder, getOrderDetail } = require('../../services/bitmartService');
const Autobot = require('../../models/Autobot');
const { handleSuccessfulBuy, handleSuccessfulSell } = require('./dataManager'); 
// NOTA: dataManagerLong.js debe existir y exportar ambas funciones.

const MIN_USDT_VALUE_FOR_BITMART = 5.00;
const ORDER_CHECK_TIMEOUT_MS = 2000;
const TRADE_SYMBOL = 'BTC_USDT';

/**
 * Coloca la primera orden de COMPRA a mercado (Entrada inicial en Long).
 * @param {object} config - Configuración del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {function} log - Función de logging inyectada.
 * @param {function} updateBotState - Función para cambiar el estado inyectada.
 * @param {function} updateGeneralBotState - Función para actualizar LBalance inyectada.
 * @param {number} currentPrice - Precio actual para usar en cálculos de datos.
 */
async function placeFirstBuyOrder(config, creds, log, updateBotState, updateGeneralBotState, currentPrice) {
    
    // Aseguramos que los valores son numéricos
    const buyAmountUSDT = parseFloat(config.long.purchaseUsdt || 0); 
    const price = parseFloat(currentPrice || 0); 
    
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    log(`Colocando la primera orden de COMPRA a mercado por ${buyAmountUSDT.toFixed(2)} USDT.`, 'info');
    
    // La verificación de capital se hace en LRunning, pero se chequea el mínimo aquí por seguridad.
    if (buyAmountUSDT < MIN_USDT_VALUE_FOR_BITMART) {
         log(`Error: Monto inicial (${buyAmountUSDT.toFixed(2)} USDT) menor que el mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART}).`, 'error');
         await updateBotState('RUNNING', 'long'); 
         return;
    }

    try {
        const order = await placeOrder(creds, SYMBOL, 'BUY', 'market', buyAmountUSDT); 
        
        // 💡 CRÍTICO: Verificar que la orden devuelve un order_id válido
        if (order && order.order_id) {
            
            // 💡 CAPTURA DE VARIABLES LOCALES PARA EL CLOSURE
            const currentOrderId = order.order_id;
            const sizeUSDT = buyAmountUSDT;
            
            log(`Orden de compra colocada. ID: ${currentOrderId}. Esperando confirmación...`, 'success');

            let botState = await Autobot.findOne({}); 

            if (botState) {
                // Pre-guardar el ID, size en USDT, y la estimación de precio
                botState.lStateData.lastOrder = {
                    order_id: currentOrderId,
                    price: price, 
                    size: sizeUSDT, 
                    side: 'buy', 
                    state: 'pending_fill'
                };
                await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });
            }
            
            // Inicia el monitoreo de la orden
            setTimeout(async () => {
                // Aquí, SYMBOL, currentOrderId y creds están en el closure
                const orderDetails = await getOrderDetail(creds, SYMBOL, currentOrderId); 
                let updatedBotState = await Autobot.findOne({});

                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                        // Llama al dataManagerLong para actualizar AC, PPC, STP, etc.
                        await handleSuccessfulBuy(updatedBotState, orderDetails, updateGeneralBotState); 
                    }
                } else {
                    log(`La orden inicial de compra ${currentOrderId} no se completó. Volviendo al estado RUNNING.`, 'error');
                    if (updatedBotState) {
                        // Limpiar el estado de orden pendiente
                        updatedBotState.lStateData.lastOrder = null;
                        updatedBotState.lStateData.orderCountInCycle = 0; 
                        await Autobot.findOneAndUpdate({}, { 'lStateData': updatedBotState.lStateData });
                        await updateBotState('RUNNING', 'long'); 
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {       
            // Si la API no devuelve ID válido o falla la respuesta
            log(`Error al colocar la primera orden de COMPRA. Respuesta API: ${JSON.stringify(order)}`, 'error');
            await updateBotState('RUNNING', 'long'); 
        }
    } catch (error) {
        log(`Error de API al colocar la primera orden de COMPRA: ${error.message}`, 'error');
        
        // 💡 Manejo de error de Balance Insuficiente
        if (error.message.includes('Balance not enough')) {
            log(`ERROR CRÍTICO LONG: Balance USDT insuficiente para la COMPRA inicial. Deteniendo estrategia Long.`, 'critical');
            await updateBotState('STOPPED', 'long');
        } else {
            await updateBotState('RUNNING', 'long');
        }
    }
}


/**
 * Coloca una orden de COMPRA de cobertura a mercado (DCA).
 * ... (La lógica es similar a placeFirstBuyOrder, pero llama a handleSuccessfulBuy) ...
 */
async function placeCoverageBuyOrder(botState, creds, buyAmountUSDT, nextCoveragePrice, log, updateBotState) {
    const SYMBOL = botState.config.symbol || TRADE_SYMBOL;
        
    log(`Colocando orden de cobertura a MERCADO (BUY) por ${buyAmountUSDT.toFixed(2)} USDT.`, 'info');
    
    try {
        const order = await placeOrder(creds, SYMBOL, 'BUY', 'market', buyAmountUSDT); 

        if (order && order.order_id) {
            
            // 💡 CAPTURA DE VARIABLES LOCALES
            const currentOrderId = order.order_id;     

            botState.lStateData.lastOrder = {
                order_id: currentOrderId,
                price: nextCoveragePrice,   
                size: buyAmountUSDT,   
                side: 'buy',
                state: 'pending_fill'
            };
            await Autobot.findOneAndUpdate({}, { 'lStateData': botState.lStateData });
            log(`Orden de cobertura colocada. ID: ${currentOrderId}. Esperando confirmación...`, 'success');

            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, currentOrderId);
                const updatedBotState = await Autobot.findOne({});
                
                if (orderDetails && orderDetails.state === 'filled') {
                    if (updatedBotState) {
                        await handleSuccessfulBuy(updatedBotState, orderDetails); 
                    }
                } else {
                    log(`La orden de cobertura ${currentOrderId} no se completó.`, 'error');
                    if (updatedBotState) {
                        updatedBotState.lStateData.lastOrder = null;
                        await Autobot.findOneAndUpdate({}, { 'lStateData': updatedBotState.lStateData });
                        await updateBotState('RUNNING', 'long');
                    }
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {
            log(`Error al colocar la orden de cobertura. Respuesta API: ${JSON.stringify(order)}`, 'error');
            await updateBotState('RUNNING', 'long');
        }
    } catch (error) {
        log(`Error de API al colocar la orden de cobertura: ${error.message}`, 'error');
        await updateBotState('RUNNING', 'long');
    }
}


/**
 * Coloca una orden de VENTA a mercado para CERRAR la posición (cierre de ciclo con ganancia/pérdida).
 * @param {object} config - Configuración del bot.
 * @param {object} creds - Credenciales de la API.
 * @param {number} sellAmountBTC - Cantidad de BTC para vender.
 * @param {function} log - Función de logging inyectada.
 * @param {function} handleSuccessfulSell - Handler de dataManagerLong.js.
 * @param {object} botState - Estado actual del bot.
 * @param {object} handlerDependencies - Dependencias del handler (ej. updateGeneralBotState).
 */
async function placeSellOrder(config, creds, sellAmountBTC, log, handleSuccessfulSell, botState, handlerDependencies) {
    const SYMBOL = config.symbol || TRADE_SYMBOL;

    log(`Colocando orden de VENTA a mercado para CERRAR por ${sellAmountBTC.toFixed(8)} BTC.`, 'info');
    try {
        const order = await placeOrder(creds, SYMBOL, 'SELL', 'market', sellAmountBTC); 

        if (order && order.order_id) {
            const currentOrderId = order.order_id;
            log(`Orden de cierre colocada. ID: ${currentOrderId}. Esperando confirmación...`, 'success');
            
            setTimeout(async () => {
                const orderDetails = await getOrderDetail(creds, SYMBOL, currentOrderId);
                if (orderDetails && orderDetails.state === 'filled') {
                    // Llama al dataManagerLong para cerrar el ciclo, calcular profit y resetear
                    await handleSuccessfulSell(botState, orderDetails, handlerDependencies); 
                } else {
                    log(`La orden de cierre ${currentOrderId} no se completó.`, 'error');
                }
            }, ORDER_CHECK_TIMEOUT_MS);
        } else {
            log(`Error al colocar la orden de cierre. Respuesta API: ${JSON.stringify(order)}`, 'error');
        }
    } catch (error) {
        log(`Error de API al colocar la orden de cierre: ${error.message}`, 'error');
    }
}

module.exports = {
    placeFirstBuyOrder,
    placeCoverageBuyOrder,
    placeSellOrder,
    MIN_USDT_VALUE_FOR_BITMART
};