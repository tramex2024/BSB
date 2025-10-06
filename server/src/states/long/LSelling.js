// BSB/server/src/states/long/LSelling.js (FINALIZADO - Lógica de Reinicio, Trailing Stop y Reseteo Completo)

const { placeSellOrder } = require('../../utils/orderManager');
const TRAILING_STOP_PERCENTAGE = 0.4;
const LSTATE = 'long'; // Constante para la estrategia actual

// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL Y CIERRE DE CICLO
// =========================================================================

/**
 * Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
 * Esta función es invocada por orderManager.js después de que la orden de venta se llena.
 * * @param {object} botStateObj - Estado del bot antes de la venta.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {object} dependencies - Dependencias inyectadas (incluye creds, log, updateGeneralBotState, etc.).
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    // Aseguramos la extracción de todas las dependencias necesarias
    const { config, log, updateBotState, updateLStateData, updateGeneralBotState, creds } = dependencies;
    
    // 1. CÁLCULO DE CAPITAL Y GANANCIA
    const { ac: totalBtcSold, ppc } = botStateObj.lStateData; 
    
    // Usamos filledSize y priceAvg (o price) para asegurar precisión en la venta.
    const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price); 
    const filledSize = parseFloat(orderDetails.filledSize || orderDetails.size); 
    
    const totalUsdtRecovered = filledSize * sellPrice; 
    const totalUsdtSpent = totalBtcSold * ppc; 
    const profit = totalUsdtRecovered - totalUsdtSpent;
    
    // 2. RECUPERACIÓN DE CAPITAL OPERATIVO Y GANANCIA (Campos de Nivel Superior)
    // Sumamos el monto total de USDT recuperado (Capital original + Profit)
    const newLBalance = botStateObj.lbalance + totalUsdtRecovered; 
    
    await updateGeneralBotState({ 
        lbalance: newLBalance,
        totalProfit: (botStateObj.totalProfit || 0) + profit,
        
        // 🎯 RESETEO DE DATOS DE ESTADO GENERAL Y CONTADORES
        ltprice: 0,        // Precio Objetivo
        lcoverage: 0,      // Monto de Cobertura Requerido
        lnorder: 0,        // Número de Órdenes
        lcycle: (botStateObj.lcycle || 0) + 1 // ¡Incrementar el contador de ciclo!
    });

    log(`Cierre de Ciclo Long Exitoso! Ganancia: ${profit.toFixed(2)} USDT.`, 'success');
    log(`LBalance actualizado. Capital operativo disponible: ${newLBalance.toFixed(2)} USDT.`, 'info');

    // 3. RESETEO DE DATOS DE CICLO ESPECÍFICOS (lStateData)
    const resetLStateData = { 
        ac: 0, ppc: 0, 
        orderCountInCycle: 0, // CRÍTICO: Reset a 0 para que LRunning inicie la compra.
        lastOrder: null, 
        pm: 0, pc: 0, pv: 0
    };
    await updateLStateData(resetLStateData); 
    
    // 4. TRANSICIÓN DE ESTADO (LÓGICA CRÍTICA DE REINICIO)
    if (config.long.stopAtCycle) {
        // Lógica 1: Si stopAtCycle es TRUE, el bot se DETIENE.
        log('Configuración: stopAtCycle activado. Bot Long se detendrá.', 'info');
        await updateBotState('STOPPED', LSTATE);
    } else {
        // Lógica 2: Si stopAtCycle es FALSE, el bot REINICIA INMEDIATAMENTE.
        // Importamos placeFirstBuyOrder aquí para evitar la dependencia circular.
        const { placeFirstBuyOrder } = require('../../utils/orderManager');

        log('Configuración: stopAtCycle desactivado. Reiniciando ciclo con nueva compra (BUYING).', 'info');
        
        // placeFirstBuyOrder colocará la orden inicial y transicionará a BUYING.
        await placeFirstBuyOrder(config, creds, log, updateBotState, updateGeneralBotState); 
    }
}


// =========================================================================
// FUNCIÓN PRINCIPAL DE GESTIÓN DEL ESTADO SELLING
// =========================================================================

async function run(dependencies) {
    const { botState, currentPrice, config, creds, log, updateLStateData, updateBotState, updateGeneralBotState } = dependencies;
    
    // Se definen las dependencias que necesitará el handler al ejecutarse (al llenar la orden de venta)
    const handlerDependencies = { config, creds, log, updateBotState, updateLStateData, updateGeneralBotState, botState };

    const { ac: acSelling, pm } = botState.lStateData;

    log("Estado Long: SELLING. Gestionando ventas...", 'info');

    // 1. CÁLCULO DEL TRAILING STOP
    const newPm = Math.max(pm || 0, currentPrice);
    const newPc = newPm * (1 - (TRAILING_STOP_PERCENTAGE / 100));

    // 2. ACTUALIZACIÓN Y PERSISTENCIA DE DATOS (PM y PC)
    botState.lStateData.pm = newPm;
    botState.lStateData.pc = newPc;

    await updateLStateData(botState.lStateData); 

    // 3. CONDICIÓN DE VENTA Y LIQUIDACIÓN
    if (acSelling > 0) {
        if (currentPrice <= newPc) {
            log(`Condiciones de venta por Trailing Stop alcanzadas. Colocando orden de venta a mercado para liquidar ${acSelling.toFixed(8)} BTC.`, 'success');
            
            // LLAMADA: placeSellOrder coloca la orden y luego llama a handleSuccessfulSell al llenarse.
            // Pasamos acSelling (total de activos a vender) y las dependencias para el handler.
            await placeSellOrder(config, creds, acSelling, log, handleSuccessfulSell, botState, handlerDependencies);

            // Nota: El estado PERMANECE en SELLING hasta que la orden se confirme como FILLED.
        }
    }
    
    log(`Esperando condiciones para la venta. Precio actual: ${currentPrice.toFixed(2)}, PM: ${newPm.toFixed(2)}, PC: ${newPc.toFixed(2)}`, 'info');
}

module.exports = { 
    run, 
    handleSuccessfulSell // Exportado para que orderManager.js pueda usarlo.
};