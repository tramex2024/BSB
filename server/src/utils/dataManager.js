// BSB/server/src/utils/dataManager.js

const Autobot = require('../../models/Autobot');
const autobotCore = require('../../autobotLogic');
const { placeFirstBuyOrder } = require('./orderManager'); // Necesita la función de orden

/**
 * Lógica para manejar una orden de compra exitosa (Inicial o de Cobertura).
 * Actualiza el Precio Promedio de Compra (PPC) y la Cantidad Acumulada (AC).
 * @param {object} botStateObj - Objeto de estado del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart.
 */
async function handleSuccessfulBuy(botStateObj, orderDetails) {
    autobotCore.log(`Orden de compra exitosa. ID: ${orderDetails.order_id}`, 'success');

    // 1. Registro de la última orden completada
    botStateObj.lStateData.lastOrder = {
        order_id: orderDetails.order_id,
        price: parseFloat(orderDetails.price), // Precio de ejecución real
        size: parseFloat(orderDetails.size),   // Cantidad de la moneda base comprada
        side: 'buy',
        state: 'filled'
    };

    // 2. Cálculo del DCA
    const newSize = parseFloat(orderDetails.size);
    const newPrice = parseFloat(orderDetails.price);
    const currentAC = botStateObj.lStateData.ac || 0;
    const currentPPC = botStateObj.lStateData.ppc || 0;
    const currentOrderCount = botStateObj.lStateData.orderCountInCycle || 0;

    const totalUSDT = (currentAC * currentPPC) + (newSize * newPrice);
    botStateObj.lStateData.ac = currentAC + newSize;
    botStateObj.lStateData.ppc = botStateObj.lStateData.ac > 0 ? totalUSDT / botStateObj.lStateData.ac : 0; 
    botStateObj.lStateData.orderCountInCycle = currentOrderCount + 1;
    
    // 3. Persiste los datos actualizados
    await Autobot.findOneAndUpdate({}, { 'lStateData': botStateObj.lStateData });
    
    // 4. Mantiene el estado en BUYING
    await autobotCore.updateBotState('BUYING', botStateObj.sstate);
}

/**
 * Lógica para manejar una orden de venta exitosa y el control de flujo post-ciclo.
 * @param {object} botStateObj - Objeto de estado del bot.
 * @param {object} orderDetails - Detalles de la orden de BitMart.
 * @param {object} config - Configuración del bot.
 * @param {object} creds - Credenciales de la API. (Necesarias para el reinicio de compra)
 */
async function handleSuccessfulSell(botStateObj, orderDetails, config, creds) {
    autobotCore.log(`Orden de venta exitosa. ID: ${orderDetails.order_id}`, 'success');

    // 1. Limpieza de lStateData para el nuevo ciclo
    botStateObj.lStateData = {
        ppc: 0,
        ac: 0,
        orderCountInCycle: 0,
        lastOrder: null,
        pm: 0,
        pc: 0,
        pv: 0
    };

    await Autobot.findOneAndUpdate({}, { 'lStateData': botStateObj.lStateData });
    
    // 2. Control de flujo
    if (config.long.stopAtCycle) {
        autobotCore.log('stopAtCycle activado. Bot Long se detendrá.', 'info');
        await autobotCore.updateBotState('STOPPED', botStateObj.sstate);
    } else {
        // CORRECCIÓN: Reinicio inmediato con una nueva compra a mercado.
        autobotCore.log('Venta completada. Reiniciando ciclo con una nueva compra a mercado (BUYING).', 'info');
        
        // La función placeFirstBuyOrder gestionará la colocación y el cambio de estado a 'BUYING'.
        await placeFirstBuyOrder(config, creds); 
    }
}

module.exports = {
    handleSuccessfulBuy,
    handleSuccessfulSell
};