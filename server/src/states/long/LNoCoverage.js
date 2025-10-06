// BSB/server/src/states/long/LNoCoverage.js (FINALIZADO - Doble Chequeo de Fondos y Limpieza)

const { MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/orderManager');
// const { cancelActiveOrders } = require('../../utils/orderManager'); // Eliminada la importación

async function run(dependencies) {
    // Extraemos las funciones y el estado de las dependencias
    const { botState, currentPrice, availableUSDT, config, creds, log, updateBotState } = dependencies;

    log("Estado Long: NO_COVERAGE. Esperando fondos o precio de venta.", 'warning');

    const { ac } = botState.lStateData;
    
    // --- 1. VERIFICACIÓN DE TRANSICIÓN A VENTA (Ganancia alcanzada) ---
    const targetSellPrice = botState.lStateData.LTPrice || 0; 

    if (currentPrice >= targetSellPrice && ac > 0 && targetSellPrice > 0) {
        log(`Precio actual alcanzó el objetivo de venta (${targetSellPrice.toFixed(2)}) desde NO_COVERAGE.`, 'success');
        
        // ❌ BLOQUE DE CANCELACIÓN ELIMINADO: Las órdenes de cobertura fallidas no existen.
        // if (botState.lStateData.lastOrder && botState.lStateData.lastOrder.order_id) {
        //     await cancelActiveOrders(creds, botState, log);
        // }
        
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. VERIFICACIÓN DE TRANSICIÓN A COMPRA (Fondos recuperados) ---
    const requiredAmount = botState.lStateData.requiredCoverageAmount || 0;
    const currentLBalance = parseFloat(botState.lbalance || 0);
    
    // ✅ CRÍTICO: Debe tener LBalance y Saldo Real para volver a BUYING.
    const isReadyToResume = 
        currentLBalance >= requiredAmount && 
        availableUSDT >= requiredAmount && 
        requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (isReadyToResume) {
        log(`Fondos (LBalance y Real) recuperados/disponibles. Monto requerido (${requiredAmount.toFixed(2)} USDT). Volviendo a BUYING.`, 'success');
        
        await updateBotState('BUYING', 'long'); 
    } else {
         let reason = '';
         if (currentLBalance < requiredAmount) {
             reason = `Esperando reposición de LBalance asignado. (Requiere: ${requiredAmount.toFixed(2)}, Actual: ${currentLBalance.toFixed(2)})`;
         } else {
             reason = `Esperando reposición de Fondos Reales. (Requiere: ${requiredAmount.toFixed(2)}, Actual: ${availableUSDT.toFixed(2)})`;
         }
         log(reason, 'info'); // Logear para mostrar qué está esperando
    }
}

module.exports = { run };