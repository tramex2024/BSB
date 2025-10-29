// BSB/server/src/states/long/LNoCoverage.js (FINALIZADO - Doble Chequeo de Fondos y Limpieza)

const { MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/orderManager');
const { calculateLongTargets } = require('../../utils/dataManager'); // 👈 AGREGADO: Importar la función de cálculo
// const { cancelActiveOrders } = require('../../utils/orderManager'); // Eliminada la importación

async function run(dependencies) {
    // Extraemos las funciones y el estado de las dependencias
    const { botState, currentPrice, availableUSDT, config, log, updateBotState, updateLStateData } = dependencies;

    log("Estado Long: NO_COVERAGE. Esperando fondos o precio de venta.", 'warning');

    const { ac } = botState.lStateData;
    
    // --- 1. VERIFICACIÓN DE TRANSICIÓN A VENTA (Ganancia alcanzada) ---
    const targetSellPrice = botState.lStateData.LTPrice || 0; 

    if (currentPrice >= targetSellPrice && ac > 0 && targetSellPrice > 0) {
        log(`Precio actual alcanzó el objetivo de venta (${targetSellPrice.toFixed(2)}) desde NO_COVERAGE.`, 'success');
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. VERIFICACIÓN DE TRANSICIÓN A COMPRA (Fondos recuperados) ---
    
    // 🛑 INICIO DE LA LÓGICA DE CORRECCIÓN
    let requiredAmount = botState.lStateData.requiredCoverageAmount || 0;
    let nextCoveragePrice = botState.lStateData.nextCoveragePrice;

    // 💡 RECALCULAR si el valor es 0, lo que significa que la lógica de LBuying falló al persistir
    //    o el cálculo inicial fue 0, y necesitamos el valor correcto para la transición.
    if (requiredAmount === 0 && botState.lStateData.orderCountInCycle > 0) {
        log("Detectado requiredCoverageAmount = 0. Forzando recalculo de targets para corregir el estado.", 'warning');
        
        // Llamar a calculateLongTargets para obtener el valor correcto (debería ser 40.00 USD)
        const recalculation = calculateLongTargets(
            botState.lStateData.ppc, 
            config.long.profit_percent, 
            config.long.price_var, 
            config.long.size_var,
            config.long.purchaseUsdt,
            botState.lStateData.orderCountInCycle,
            botState.lbalance 
        );
        
        // Usamos el requiredAmount calculado (que debería ser 40.00)
        requiredAmount = recalculation.requiredCoverageAmount;
        nextCoveragePrice = recalculation.nextCoveragePrice; 

        // 🎯 Persistir el valor CORREGIDO en la DB para que el Frontend y LBuying lo vean correctamente.
        await updateLStateData({ 
            requiredCoverageAmount: requiredAmount, 
            nextCoveragePrice: nextCoveragePrice 
        });
        
        log(`Required Amount corregido a ${requiredAmount.toFixed(2)} USDT.`, 'warning');
    }
    // 🛑 FIN DE LA LÓGICA DE CORRECCIÓN

    const currentLBalance = parseFloat(botState.lbalance || 0);
    
    // ✅ CRÍTICO: Debe tener LBalance, Saldo Real y el monto requerido debe ser mayor al mínimo.
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