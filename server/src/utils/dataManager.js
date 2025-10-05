// BSB/server/src/utils/dataManager.js (CORREGIDO - Control de Contadores y Capital)

const Autobot = require('../../models/Autobot');
const autobotCore = require('../../autobotLogic');
// NOTA: Se ha ELIMINADO la importación global de placeFirstBuyOrder

/**
 * Lógica para manejar una orden de compra exitosa (Inicial o de Cobertura).
 * Actualiza el Precio Promedio de Compra (PPC) y la Cantidad Acumulada (AC).
 * @param {object} botStateObj - Objeto de estado del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart.
 * @param {function} [updateGeneralBotState] - Función para actualizar LBalance (inyectada solo desde placeFirstBuyOrder).
 */
async function handleSuccessfulBuy(botStateObj, orderDetails, updateGeneralBotState) { // ⬅️ ACEPTA updateGeneralBotState
    autobotCore.log(`Orden de compra exitosa. ID: ${orderDetails.order_id}`, 'success');

    // Usaremos filledSize y priceAvg (o price) para asegurar precisión.
    const newSize = parseFloat(orderDetails.filledSize || orderDetails.size);
    const newPrice = parseFloat(orderDetails.priceAvg || orderDetails.price);
    const newNotional = parseFloat(orderDetails.filledNotional); // Monto real gastado en USDT

    // 1. Cálculo del DCA (Dollar-Cost Averaging)
    const currentAC = botStateObj.lStateData.ac || 0;
    const currentPPC = botStateObj.lStateData.ppc || 0;
    
    const totalUSDT = (currentAC * currentPPC) + newNotional; // Usamos el notional real gastado

    botStateObj.lStateData.ac = currentAC + newSize;
    botStateObj.lStateData.ppc = botStateObj.lStateData.ac > 0 ? totalUSDT / botStateObj.lStateData.ac : 0; 
    
    // 2. Incremento del Contador de Órdenes (CRÍTICO)
    const currentOrderCount = botStateObj.lStateData.orderCountInCycle || 0;
    botStateObj.lStateData.orderCountInCycle = currentOrderCount + 1; // ⬅️ Se incrementa en toda compra exitosa
    
    // 3. Registro de la última orden completada
    botStateObj.lStateData.lastOrder = {
        order_id: orderDetails.order_id,
        price: newPrice,
        size: newSize,  
        side: 'buy',
        state: 'filled'
    };

    // 4. Actualización del LBalance (Solo para la primera compra exitosa)
    // El LBalance se reduce por el notional real gastado.
    if (updateGeneralBotState) { 
        // ⚠️ Solo se ejecuta en la primera orden (llamada desde placeFirstBuyOrder)
        const newLBalance = botStateObj.lbalance - newNotional;
        await updateGeneralBotState({ lbalance: newLBalance });
        autobotCore.log(`LBalance reducido en ${newNotional.toFixed(2)} USDT. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');
    }
    
    // 5. Persiste los datos actualizados
    await Autobot.findOneAndUpdate({}, { 'lStateData': botStateObj.lStateData });
    
    // 6. Transición (Solo si es cobertura, si es primera orden, ya se hizo en orderManager)
    // Dejamos que el ciclo principal se encargue de la transición si es cobertura (manteniéndose en BUYING).
}

/**
 * Lógica para manejar una orden de venta exitosa y el control de flujo post-ciclo.
 * @param {object} botStateObj - Objeto de estado del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart.
 * @param {object} dependencies - Dependencias inyectadas desde LSelling.
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    // ⚠️ Ahora se usan las dependencias inyectadas para la lógica de capital y reseteo
    const { config, log, updateBotState, updateLStateData, updateGeneralBotState } = dependencies; 

    log(`Orden de venta exitosa. ID: ${orderDetails.order_id}`, 'success');

    // 1. Limpieza de lStateData para el nuevo ciclo
    // ⚠️ Esta lógica de reseteo debe estar en LSelling.js (como lo corregimos arriba)
    // para que la gestión de capital y el reseteo sean atómicos dentro del estado.
    // Aquí solo se manejaría la lógica de capital.

    // 2. Control de flujo y reinicio
    if (config.long.stopAtCycle) {
        log('stopAtCycle activado. Bot Long se detendrá.', 'info');
        await updateBotState('STOPPED', 'long');
    } else {
        // Vuelve a RUNNING para que LRunning.js (que ya corregimos) busque la nueva señal de entrada.
        await updateBotState('RUNNING', 'long');
    }
}

module.exports = {
    handleSuccessfulBuy,
    handleSuccessfulSell
};