// BSB/server/src/states/long/LNoCoverage.js (MEJORADO - Recalculo Forzado en NO_COVERAGE)

const { MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/orderManager');
const { calculateLongTargets } = require('../../utils/dataManager'); // 👈 Importar la función de cálculo
// const { cancelActiveOrders } = require('../../utils/orderManager'); // Eliminada la importación

async function run(dependencies) {
    // Extraemos las funciones y el estado de las dependencias
    // Asegúrate de que updateLStateData esté aquí
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
    
    // 🛑 INICIO DE LA LÓGICA DE RECALCULO FORZADO
    let requiredAmount = botState.lStateData.requiredCoverageAmount || 0;
    
    // Forzamos el recalculo si hay una posición abierta (ac > 0). 
    // Esto asegura que cualquier cambio manual en orderCountInCycle se aplique.
    if (ac > 0 && botState.lStateData.orderCountInCycle >= 0) { 
        log("Forzando recalculo de RequiredAmount en NO_COVERAGE para asegurar la consistencia del estado.", 'warning');
        
        const recalculation = calculateLongTargets(
            botState.lStateData.ppc, 
            config.long.profit_percent, 
            config.long.price_var, 
            config.long.size_var,
            config.long.purchaseUsdt,
            botState.lStateData.orderCountInCycle,
            botState.lbalance 
        );
        
        // Actualizamos la variable local con el valor recalculado
        requiredAmount = recalculation.requiredCoverageAmount;
        let nextCoveragePrice = recalculation.nextCoveragePrice; 

        // 🎯 Persistir el valor CORREGIDO
        await updateLStateData({ 
            requiredCoverageAmount: requiredAmount, 
            nextCoveragePrice: nextCoveragePrice 
        });
        
        log(`Required Amount corregido/verificado a ${requiredAmount.toFixed(2)} USDT.`, 'warning');
    }
    // 🛑 FIN DE LA LÓGICA DE RECALCULO FORZADO

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