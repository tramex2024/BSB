// BSB/server/src/states/long/LSelling.js (FINAL Y COMPLETO CON RECUPERACIÓN DE CAPITAL)

const { placeSellOrder } = require('../../utils/orderManager');
const TRAILING_STOP_PERCENTAGE = 0.4;
const LSTATE = 'long'; // Constante para la estrategia actual

// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL
// =========================================================================

/**
 * Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
 * @param {object} botStateObj - Estado del bot antes de la venta.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {object} dependencies - Dependencias inyectadas.
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateLStateData, updateGeneralBotState } = dependencies;
    const { ac: totalBtcSold, ppc } = botStateObj.lStateData; // BTC total que se vendió y el Precio Promedio de Compra
    
    // Asumiremos que orderDetails contiene el monto total en USDT de la venta.
    // Si BitMart retorna solo 'size' y 'price', necesitarás calcular el valor.
    const sellPrice = parseFloat(orderDetails.price); // Precio promedio de venta
    const totalUsdtRecovered = totalBtcSold * sellPrice; // Monto total recuperado en USDT (Capital + Ganancia/Pérdida)

    // 1. CÁLCULO DE GANANCIA (o Pérdida)
    const totalUsdtSpent = totalBtcSold * ppc; // El capital USDT original gastado
    const profit = totalUsdtRecovered - totalUsdtSpent;
    
    // 2. RECUPERACIÓN DE CAPITAL OPERATIVO (LBalance)
    // El LBalance suma el monto total de USDT recuperado (Capital original + Profit)
    const newLBalance = botStateObj.lbalance + totalUsdtRecovered; 
    
    await updateGeneralBotState({ 
        lbalance: newLBalance,
        totalProfit: (botStateObj.totalProfit || 0) + profit // Sumamos la ganancia al profit total
    });

    log(`Cierre de Ciclo Long Exitoso! Ganancia: ${profit.toFixed(2)} USDT.`, 'success');
    log(`LBalance actualizado. Capital operativo disponible: ${newLBalance.toFixed(2)} USDT.`, 'info');

    // 3. RESETEO DE DATOS DE CICLO
    const resetData = { 
        ac: 0, ppc: 0, 
        orderCountInCycle: 0, lastOrder: null, 
        pm: 0, pc: 0, LTPrice: 0 
    };
    await updateLStateData(resetData);
    
    // 4. TRANSICIÓN DE ESTADO
    if (config.long.stopAtCycle) {
        log('stopAtCycle activado. Bot Long se detendrá.', 'info');
        await updateBotState('STOPPED', LSTATE);
    } else {
        await updateBotState('RUNNING', LSTATE); // Volver a RUNNING para esperar nueva señal
    }
}


// =========================================================================
// FUNCIÓN PRINCIPAL DE GESTIÓN DEL ESTADO SELLING
// =========================================================================

async function run(dependencies) {
    // Asegúrate de que updateGeneralBotState se extraiga aquí también
    const { botState, currentPrice, config, creds, log, updateLStateData, updateBotState, updateGeneralBotState } = dependencies;
    
    // Nota: Pasamos 'handleSuccessfulSell' al 'orderManager' a través de la inyección
    // para que este sepa qué hacer cuando la orden se llene.
    const handlerDependencies = { config, log, updateBotState, updateLStateData, updateGeneralBotState, botState };

    const { ac: acSelling, pm } = botState.lStateData;

    log("Estado Long: SELLING. Gestionando ventas...", 'info');

    // 1. CÁLCULO DEL TRAILING STOP
    const newPm = Math.max(pm || 0, currentPrice);
    const newPc = newPm * (1 - (TRAILING_STOP_PERCENTAGE / 100));

    // 2. ACTUALIZACIÓN Y PERSISTENCIA DE DATOS
    botState.lStateData.pm = newPm;
    botState.lStateData.pc = newPc;

    await updateLStateData(botState.lStateData); 

    // 3. CONDICIÓN DE VENTA Y LIQUIDACIÓN
    if (acSelling > 0) {
        if (currentPrice <= newPc) {
            log(`Condiciones de venta por Trailing Stop alcanzadas. Colocando orden de venta a mercado para liquidar ${acSelling.toFixed(8)} BTC.`, 'success');
            
            // LLAMADA ACTUALIZADA: Aquí placeSellOrder debe ser modificado para aceptar un callback (handleSuccessfulSell)
            await placeSellOrder(config, creds, acSelling, log, handleSuccessfulSell, botState, handlerDependencies);

            // Nota: El estado PERMANECE en SELLING hasta que la orden se confirme como FILLED.
        }
    }
    
    // Corrección de la llamada al log
    log(`Esperando condiciones para la venta. Precio actual: ${currentPrice.toFixed(2)}, PM: ${newPm.toFixed(2)}, PC: ${newPc.toFixed(2)}`, 'info');
}

module.exports = { 
    run, 
    handleSuccessfulSell // Exportamos para que orderManager pueda usarlo directamente si es necesario.
};