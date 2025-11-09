// BSB/server/src/states/long/LNoCoverage.js (AJUSTADO)

const { MIN_USDT_VALUE_FOR_BITMART } = require('../managers/longOrderManager');
const { calculateLongTargets } = require('../managers/longDataManager');
// const { cancelActiveOrders } = require('../managers/longOrderManager');

async function run(dependencies) {
    // Extraemos las funciones y el estado de las dependencias
    const { botState, currentPrice, availableUSDT, config, log, updateBotState, updateLStateData } = dependencies;

    log("Estado Long: NO_COVERAGE. Esperando fondos o precio de venta.", 'warning');

    const { ac } = botState.lStateData;
    
    // --- 1. VERIFICACIÓN DE TRANSICIÓN A VENTA (Ganancia alcanzada) ---
    const targetSellPrice = botState.ltprice || 0; // Usar botState.ltprice para el target (lo que está en la DB principal)

    if (currentPrice >= targetSellPrice && ac > 0 && targetSellPrice > 0) {
        log(`Precio actual alcanzó el objetivo de venta (${targetSellPrice.toFixed(2)}) desde NO_COVERAGE.`, 'success');
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. VERIFICACIÓN DE TRANSICIÓN A COMPRA (Fondos recuperados) ---
    
    // 🛑 INICIO DE LA LÓGICA DE RECALCULO FORZADO
    let requiredAmount = botState.lStateData.requiredCoverageAmount || 0;
    
    // Forzamos el recalculo si hay una posición abierta (ac > 0). 
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
    // === LÓGICA AGREGADA: CORRECCIÓN DEL ESTADO INICIAL (ac = 0) ===
    else if (ac === 0) {
        requiredAmount = config.long.purchaseUsdt;
        log(`Posición reseteada (AC=0). Monto Requerido forzado a: ${requiredAmount.toFixed(2)} USDT (Primera Compra).`, 'info');
    }
    // 🛑 FIN DE LA LÓGICA DE RECALCULO FORZADO

    const currentLBalance = parseFloat(botState.lbalance || 0);
    
    // ✅ CRÍTICO: Ahora requiredAmount será 5.00 USDT si AC=0.
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