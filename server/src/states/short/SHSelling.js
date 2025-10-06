// BSB/server/src/states/short/SHSelling.js

const { placeBuyToCoverOrder } = require('../../utils/orderManager');
const TRAILING_STOP_PERCENTAGE = 0.4;
const SSTATE = 'short';

// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL (POST-COBERTURA)
// =========================================================================

/**
 * Lógica para manejar una orden de COMPRA exitosa (cierre de ciclo Short/cubrimiento).
 * @param {object} botStateObj - Estado del bot antes de la compra para cubrir.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {object} dependencies - Dependencias inyectadas.
 */
async function handleSuccessfulBuyToCover(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateSStateData, updateGeneralBotState, creds } = dependencies; 
    
    // 1. CÁLCULO DE CAPITAL Y GANANCIA (Invertido)
    // Usamos filledSize y priceAvg (o price) para asegurar precisión en la compra para cubrir.
    const { ac: totalBtcSoldShort, ppc: pps } = botStateObj.sStateData; 
    
    const coverPrice = parseFloat(orderDetails.priceAvg || orderDetails.price); 
    const filledSize = parseFloat(orderDetails.filledSize || orderDetails.size); 
    
    const usdtReceivedFromShort = totalBtcSoldShort * pps; // El monto original recibido
    const usdtSpentToCover = filledSize * coverPrice;      // El monto gastado para cubrir

    // Ganancia es (Monto Recibido - Monto Gastado). Si es positivo, es ganancia; si es negativo, pérdida.
    const profit = usdtReceivedFromShort - usdtSpentToCover; 
    
    // 2. RECUPERACIÓN DE CAPITAL OPERATIVO (SBalance)
    // El capital gastado para cubrir DEBE salir del SBalance.
    // El SBalance se repone con el capital que estaba "comprometido" + la ganancia/pérdida.
    const newSBalance = botStateObj.sbalance + usdtReceivedFromShort - usdtSpentToCover; 
    
    await updateGeneralBotState({ 
        sbalance: newSBalance,
        totalProfit: (botStateObj.totalProfit || 0) + profit, // Assuming totalProfit is shared
        
        // 🎯 RESETEO DE DATOS DE ESTADO GENERAL Y CONTADORES
        stprice: 0, 
        scoverage: 0, 
        snorder: 0, 
        scycle: (botStateObj.scycle || 0) + 1 // ¡Incrementar el contador de ciclo!
    });

    log(`Cierre de Ciclo Short Exitoso! Ganancia: ${profit.toFixed(2)} USDT.`, 'success');
    log(`SBalance actualizado. Capital operativo disponible: ${newSBalance.toFixed(2)} USDT.`, 'info');

    // 3. RESETEO DE DATOS DE CICLO ESPECÍFICOS (sStateData)
    const resetSStateData = { 
        ac: 0, ppc: 0, 
        orderCountInCycle: 0, // CRÍTICO: Reset a 0.
        lastOrder: null, 
        pm: 0, pc: 0, pv: 0
    };
    await updateSStateData(resetSStateData); 
    
    // 4. TRANSICIÓN DE ESTADO (LÓGICA CRÍTICA DE REINICIO)
    if (config.short.stopAtCycle) {
        log('Configuración: stopAtCycle activado. Bot Short se detendrá.', 'info');
        await updateBotState('STOPPED', SSTATE);
    } else {
        const { placeFirstSellOrder } = require('../../utils/orderManager');
        log('Configuración: stopAtCycle desactivado. Reiniciando ciclo con nueva venta (SHBUYING).', 'info');
        await placeFirstSellOrder(config, creds, log, updateBotState, updateGeneralBotState); 
    }
}


// =========================================================================
// FUNCIÓN PRINCIPAL DE GESTIÓN DEL ESTADO SELLING
// =========================================================================

async function run(dependencies) {
    const { botState, currentPrice, config, creds, log, updateSStateData, updateBotState, updateGeneralBotState } = dependencies;
    
    const handlerDependencies = { config, creds, log, updateBotState, updateSStateData, updateGeneralBotState, botState };

    const { ac: acShort, pm } = botState.sStateData;

    log("Estado Short: SHSELLING. Gestionando cubrimiento...", 'info');

    // 1. CÁLCULO DEL TRAILING STOP (Invertido)
    // En Short, el Trailing Stop es para EVITAR que el precio suba demasiado.
    // El PM (Precio Máximo) es el precio más BAJO alcanzado.
    const newPm = Math.min(pm || currentPrice, currentPrice); // Aquí pm es el mínimo (Price Minimum)
    
    // El PC (Precio de Cubrimiento) se activa cuando el precio SUBE desde el PM
    // Formula: PM * (1 + (Trailing / 100))
    const newPc = newPm * (1 + (TRAILING_STOP_PERCENTAGE / 100));

    // 2. ACTUALIZACIÓN Y PERSISTENCIA DE DATOS
    botState.sStateData.pm = newPm; // Actualizamos el mínimo
    botState.sStateData.pc = newPc; // Precio de disparo de cubrimiento

    await updateSStateData(botState.sStateData); 

    // 3. CONDICIÓN DE CUBRIMIENTO Y LIQUIDACIÓN
    if (acShort > 0) {
        // En Short, disparamos la compra de cubrimiento cuando el precio CAE al objetivo (SHBuying)
        // O cuando el precio SUBE demasiado (Trailing Stop / Price Protection)
        if (currentPrice >= newPc) {
             log(`Condiciones de cubrimiento por Trailing Stop alcanzadas. Colocando orden de COMPRA a mercado para cubrir ${acShort.toFixed(8)} BTC.`, 'success');
             
             // LLAMADA: placeBuyToCoverOrder llama a handleSuccessfulBuyToCover al llenar la orden.
             await placeBuyToCoverOrder(config, creds, acShort, log, handleSuccessfulBuyToCover, botState, handlerDependencies);

             // Nota: El estado PERMANECE en SHSELLING hasta que la orden se confirme.
        }
    }
    
    log(`Esperando condiciones para el cubrimiento. Precio actual: ${currentPrice.toFixed(2)}, PM (Mínimo): ${newPm.toFixed(2)}, PC (Disparo): ${newPc.toFixed(2)}`, 'info');
}

module.exports = { 
    run, 
    handleSuccessfulBuyToCover // Exportamos para que orderManager pueda usarlo.
};