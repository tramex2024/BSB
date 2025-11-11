const { MIN_USDT_VALUE_FOR_BITMART } = require('../../managers/longOrderManager');
const { calculateLongTargets } = require('../../../autobotCalculations');

async function run(dependencies) {
    // 🛑 CORRECCIÓN: Quitamos availableUSDT de la desestructuración y lo definimos localmente
    const { 
        botState, currentPrice, config, log, 
        updateBotState, updateLStateData,
        getBotState 
    } = dependencies;
    
    // ✅ CRÍTICO: Garantizamos que availableUSDT siempre es un número (0 si falla la API)
    const availableUSDT = parseFloat(dependencies.availableUSDT || 0);

    log("Estado Long: NO_COVERAGE. Esperando fondos o precio de venta.", 'warning');

    const { ac } = botState.lStateData;
    
    // --- 1. VERIFICACIÓN DE TRANSICIÓN A VENTA (Ganancia alcanzada) ---
    const targetSellPrice = botState.ltprice || 0; 

    if (currentPrice >= targetSellPrice && ac > 0 && targetSellPrice > 0) {
        log(`Precio actual alcanzó el objetivo de venta (${targetSellPrice.toFixed(2)}) desde NO_COVERAGE.`, 'success');
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. VERIFICACIÓN DE TRANSICIÓN A COMPRA (Fondos recuperados) ---
    
    // 🛑 RECUPERACIÓN DE ESTADO MÁS RECIENTE (Para ver el 11 USDT inyectado)
    let latestBotState = botState;
    if (getBotState) {
        try {
            latestBotState = await getBotState();
        } catch (error) {
            log(`ERROR CRÍTICO: No se pudo recargar el estado de la DB. Usando estado inyectado. Causa: ${error.message}`, 'error');
        }
    }
    
    // INICIO DE LA LÓGICA DE RECALCULO FORZADO
    
    // ✅ CORRECCIÓN CRÍTICA: Inicialización ÚNICA y SEGURA de requiredAmount.
    // Inicializamos con el valor guardado o el valor de la primera compra (config.long.purchaseUsdt).
    let requiredAmount = latestBotState.lStateData.requiredCoverageAmount || config.long.purchaseUsdt || 0;
    
    // Forzamos el recalculo si hay una posición abierta (ac > 0). 
    if (ac > 0 && latestBotState.lStateData.orderCountInCycle >= 0) { 
        log("Forzando recalculo de RequiredAmount en NO_COVERAGE para asegurar la consistencia del estado.", 'warning');
        
        const recalculation = calculateLongTargets(
            latestBotState.lStateData.ppc, 
            config.long.profit_percent, 
            config.long.price_var, 
            config.long.size_var,
            config.long.purchaseUsdt,
            latestBotState.lStateData.orderCountInCycle,
            latestBotState.lbalance 
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
    
    const currentLBalance = parseFloat(latestBotState.lbalance || 0); // <-- Usar el LBalance más reciente
    
    // ✅ Log de diagnóstico (Tu sugerencia, ahora funcional)
    log(`[DIAGNÓSTICO BALANCE]: Estado LBalance después de recarga: ${currentLBalance} | Req. Amount: ${requiredAmount.toFixed(2)}`, 'info');

    // 🛑 Log de diagnóstico detallado (Funcional gracias a la corrección de availableUSDT)
    log(`DIAGNOSTICO NO_COVERAGE: LBal=${currentLBalance.toFixed(2)} (Req=${requiredAmount.toFixed(2)}) | RealBal=${availableUSDT.toFixed(2)} (Req=${requiredAmount.toFixed(2)}) | MinVal=${MIN_USDT_VALUE_FOR_BITMART.toFixed(2)}`, 'debug');
    log(`Condiciones: LBalOK: ${currentLBalance >= requiredAmount} | RealOK: ${availableUSDT >= requiredAmount} | MinOK: ${requiredAmount >= MIN_USDT_VALUE_FOR_BITMART}`, 'debug');

    // ✅ LÓGICA DE TRANSICIÓN FINAL
    // Si esta condición es TRUE, el bot debe transicionar.
    if (currentLBalance >= requiredAmount && availableUSDT >= requiredAmount && requiredAmount >= MIN_USDT_VALUE_FOR_BITMART) {
        
        log(`Fondos (LBalance: ${currentLBalance.toFixed(2)} y Real: ${availableUSDT.toFixed(2)}) recuperados/disponibles. Monto requerido (${requiredAmount.toFixed(2)} USDT). Volviendo a BUYING.`, 'success');
        
        await updateBotState('BUYING', 'long'); 
    } else {
        // 🛑 LÓGICA DE ESPERA
        let reason = '';
        
        if (currentLBalance < requiredAmount) {
            reason = `Esperando reposición de LBalance asignado. (Requiere: ${requiredAmount.toFixed(2)}, Actual: ${currentLBalance.toFixed(2)})`;
        } else if (availableUSDT < requiredAmount) {
            reason = `Esperando reposición de Fondos Reales. (Requiere Real: ${requiredAmount.toFixed(2)}, Actual Real: ${availableUSDT.toFixed(2)} | LBalance: ${currentLBalance.toFixed(2)})`;
        } else {
             reason = `Esperando que el Monto Requerido alcance el Mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART.toFixed(2)}). Requerido: ${requiredAmount.toFixed(2)}`;
         }
        log(reason, 'info'); 
    }
}

module.exports = { run };