// BSB/server/src/states/long/LNoCoverage.js (REFRACTORIZADO Y FINALIZADO)

const { MIN_USDT_VALUE_FOR_BITMART } = require('../../utils/orderManager');
const { calculateLongTargets } = require('../../utils/dataManager');

async function run(dependencies) {
    // Extraemos las funciones y el estado de las dependencias
    const { botState, currentPrice, availableUSDT, config, log, updateBotState, updateLStateData, updateGeneralBotState } = dependencies;

    log("Estado Long: NO_COVERAGE. Esperando fondos o precio de venta.", 'warning');

    const { ac } = botState.lStateData;
    
    // --- 1. VERIFICACIÓN DE TRANSICIÓN A VENTA (Ganancia alcanzada) ---
    // Usar botState.ltprice para el target (lo que está en la DB principal)
    const targetSellPrice = botState.ltprice || 0; 

    if (currentPrice >= targetSellPrice && ac > 0 && targetSellPrice > 0) {
        log(`Precio actual alcanzó el objetivo de venta (${targetSellPrice.toFixed(2)}) desde NO_COVERAGE. Transicionando a SELLING.`, 'success');
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. LÓGICA DE CÁLCULO DE MONTO REQUERIDO (Asegurar que sea el valor correcto) ---
    
    let requiredAmount = botState.lStateData.requiredCoverageAmount || 0;
    
    if (ac > 0) {
        // Posición abierta, calculamos la próxima DCA requerida.
        // Forzamos el recalculo si hay una posición abierta (ac > 0). 
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
        
        log(`Required Amount corregido/verificado a ${requiredAmount.toFixed(2)} USDT (DCA).`, 'warning');
    } 
    else if (ac === 0) {
        // Posición cerrada, esperando fondos para la primera compra.
        // ✅ CRÍTICO: Usamos el purchaseUsdt de la configuración (ahora 6.0 USDT).
        requiredAmount = config.long.purchaseUsdt; 
        log(`Posición reseteada (AC=0). Monto Requerido forzado a: ${requiredAmount.toFixed(2)} USDT (Primera Compra).`, 'info');
    }

    // --- 3. VERIFICACIÓN DE TRANSICIÓN A COMPRA (Fondos recuperados) ---

    const currentLBalance = parseFloat(botState.lbalance || 0);
    
    const isReadyToResume = 
        currentLBalance >= requiredAmount && 
        availableUSDT >= requiredAmount && 
        // CRÍTICO: Ahora requiredAmount es 6.0 USDT si AC=0, cumpliendo el MIN_USDT_VALUE_FOR_BITMART (5.0)
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