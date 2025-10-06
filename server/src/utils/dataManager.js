// BSB/server/src/utils/dataManager.js (FINALIZADO - Control de Contadores y Capital)

const Autobot = require('../../models/Autobot');
const autobotCore = require('../../autobotLogic');
// NOTA: Se ha ELIMINADO la importación global de placeFirstBuyOrder
// para romper la dependencia circular con orderManager.js

// Constante para el porcentaje de trailing stop (tomado de LSelling para consistencia)
const TRAILING_STOP_PERCENTAGE = 0.4; 

/**
 * Lógica para manejar una orden de compra exitosa (Inicial o de Cobertura).
 * Actualiza el Precio Promedio de Compra (PPC) y la Cantidad Acumulada (AC).
 *
 * Esta función cumple con el punto 1 y 2 de tu estrategia:
 * 1. Persiste los datos de la orden (orderCountInCycle incrementado, AC, PPC, lastOrder).
 * 2. Inicializa PM, PC, y LTPrice después de la primera orden para el estado BUYING.
 * * @param {object} botStateObj - Objeto de estado del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart.
 * @param {function} [updateGeneralBotState] - Función para actualizar LBalance (inyectada solo desde placeFirstBuyOrder).
 */
async function handleSuccessfulBuy(botStateObj, orderDetails, updateGeneralBotState) { 
    autobotCore.log(`Orden de compra exitosa. ID: ${orderDetails.order_id}`, 'success');

    const newSize = parseFloat(orderDetails.filledSize || orderDetails.size);
    const newPrice = parseFloat(orderDetails.priceAvg || orderDetails.price); // Precio real de ejecución
    const newNotional = parseFloat(orderDetails.filledNotional); // Monto real gastado en USDT

    // 1. Cálculo del DCA (Dollar-Cost Averaging)
    const currentAC = botStateObj.lStateData.ac || 0;
    const currentPPC = botStateObj.lStateData.ppc || 0;
    const currentOrderCount = botStateObj.lStateData.orderCountInCycle || 0;
    
    const newNotional = parseFloat(orderDetails.filledNotional); // Monto real gastado en USDT

    const totalUSDT = (currentAC * currentPPC) + newNotional; 

    botStateObj.lStateData.ac = currentAC + newSize;
    botStateObj.lStateData.ppc = botStateObj.lStateData.ac > 0 ? totalUSDT / botStateObj.lStateData.ac : 0; 
    
    // 2. Incremento del Contador de Órdenes
    botStateObj.lStateData.orderCountInCycle = currentOrderCount + 1; 

    // 3. INICIALIZACIÓN DE PARÁMETROS CRÍTICOS (PM, PC, LTPrice)
    const newPPC = botStateObj.lStateData.ppc;

    // Se inicializa solo si es la primera orden (o si los parámetros están en cero)
    if (currentOrderCount === 0 || botStateObj.lStateData.pm === 0) { 
        // El Precio Máximo (PM) se inicializa en el Precio Promedio de Compra
        botStateObj.lStateData.pm = newPPC; 
        
        // El Precio de Venta (PC) se establece inicialmente para la ganancia objetivo (PPC + % profit)
        // NOTA: Para el trailing stop, el PC es el precio de activación de la venta (PM - 0.4%).
        // Lo inicializamos con el precio de la primera compra para dar espacio a la subida.
        // Asumimos que el "precio de venta" que quieres ver inicialmente en el frontend (LTarget)
        // se calcula en otro lugar (LBuying.js) y esto es solo el PM/PC para el Trailing.
        // Lo inicializamos un 0.4% por encima del PPC para que el precio de mercado tenga que subir un poco
        // antes de que el trailing stop pueda activarse.
        botStateObj.lStateData.pc = newPPC * (1 + (TRAILING_STOP_PERCENTAGE / 100));
        
        // LTPrice (Last Transaction Price) es el precio de ejecución de la orden
        botStateObj.lStateData.LTPrice = newPrice;
    } else {
        // Para órdenes de cobertura, solo actualizamos el LTPrice 
        botStateObj.lStateData.LTPrice = newPrice;
    }
    
    // 4. Registro de la última orden completada
    botStateObj.lStateData.lastOrder = {
       order_id: orderDetails.order_id,
       price: newPrice,
       size: newSize, 
       usdt_amount: newNotional,
       side: 'buy',
       state: 'filled'
};

    // 5. Actualización del LBalance (Solo para la primera compra exitosa)
    if (updateGeneralBotState) { 
        // Se ejecuta solo en la primera orden (llamada desde placeFirstBuyOrder)
        const newLBalance = botStateObj.lbalance - newNotional;
        await updateGeneralBotState({ lbalance: newLBalance });
        autobotCore.log(`LBalance reducido en ${newNotional.toFixed(2)} USDT. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');
    }
    
    // 6. Persiste los datos actualizados
    await Autobot.findOneAndUpdate({}, { 'lStateData': botStateObj.lStateData });
}

/**
 * Lógica para manejar una orden de venta exitosa y el control de flujo post-ciclo.
 * * Esta función cumple con el punto 4 de tu estrategia:
 * 4. Resetea los parámetros a 0 para el próximo ciclo.
 * * @param {object} botStateObj - Objeto de estado del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart.
 * @param {object} dependencies - Dependencias inyectadas.
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState } = dependencies; 

    log(`Orden de venta exitosa. ID: ${orderDetails.order_id}`, 'success');
    
    // ⚠️ NOTA: La lógica de reseteo de 'lStateData' (ppc=0, ac=0, orderCountInCycle=0, etc.)
    // Y la gestión de capital (LBalance) están ahora en LSelling.js para asegurar
    // que la limpieza y el flujo de capital sean atómicos y ocurran ANTES de cualquier reinicio.
    
    // 1. Control de flujo y reinicio (o detención)
    if (config.long.stopAtCycle) {
        log('stopAtCycle activado. Bot Long se detendrá.', 'info');
        await updateBotState('STOPPED', 'long');
    } else {
        // Vuelve a BUYING a través de placeFirstBuyOrder (ejecutado en LSelling.js)
        // No hay transición aquí, ya que LSelling.js maneja la importación y llamada.
        log('Venta completada. Reiniciando ciclo automáticamente.', 'info');
    }
}

module.exports = {
    handleSuccessfulBuy,
    handleSuccessfulSell
};