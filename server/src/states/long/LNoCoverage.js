// BSB/server/src/states/long/LNoCoverage.js (FINAL CORREGIDO CON RECARGA DE ESTADO)

const { MIN_USDT_VALUE_FOR_BITMART } = require('../../managers/longOrderManager');
const { calculateLongTargets } = require('../../../autobotCalculations');

async function run(dependencies) {
    // Extraemos las funciones y el estado de las dependencias
    const { 
        botState, currentPrice, availableUSDT, config, log, 
        updateBotState, updateLStateData,
        getBotState // <-- CRÍTICO: Inyectar la función de recarga
    } = dependencies;

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
    
    // 🛑 RECUPERACIÓN DE ESTADO MÁS RECIENTE
    // Recargamos el estado para obtener el lbalance más actual, en caso de que el usuario lo haya modificado
    // o haya habido un cierre de ciclo justo antes.
    let latestBotState = botState;
    if (getBotState) {
        try {
            // Se realiza la recarga de la DB
            latestBotState = await getBotState();
        } catch (error) {
            log(`ERROR CRÍTICO: No se pudo recargar el estado de la DB. Usando estado obsoleto. Causa: ${error.message}`, 'error');
            // Continúa usando el 'botState' inyectado (obsoleto) si la recarga falla.
        }
    }
    
    // INICIO DE LA LÓGICA DE RECALCULO FORZADO
    // Usamos latestBotState para obtener la información más reciente
    let requiredAmount = latestBotState.lStateData.requiredCoverageAmount || 0;
    
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
            latestBotState.lbalance // <-- Usar el lbalance más reciente
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

    const currentLBalance = parseFloat(latestBotState.lbalance || 0); // <-- Usar el LBalance más reciente
    
    // ✅ CRÍTICO: Verificación de fondos
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