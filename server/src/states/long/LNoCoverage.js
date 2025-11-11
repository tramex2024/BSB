// BSB/server/src/states/long/LNoCoverage.js (Versión Final Sintácticamente Correcta)

const { MIN_USDT_VALUE_FOR_BITMART } = require('../../managers/longOrderManager');
const { calculateLongTargets } = require('../../../autobotCalculations');

async function run(dependencies) {
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
    
    // 🛑 RECUPERACIÓN DE ESTADO MÁS RECIENTE
    let latestBotState = botState;
    if (getBotState) {
        try {
            latestBotState = await getBotState();
        } catch (error) {
            log(`ERROR CRÍTICO: No se pudo recargar el estado de la DB. Usando estado inyectado. Causa: ${error.message}`, 'error');
        }
    }
    
    // INICIO DE LA LÓGICA DE RECALCULO FORZADO
    
    // ✅ Inicialización ÚNICA y SEGURA de requiredAmount.
    let requiredAmount = latestBotState.lStateData.requiredCoverageAmount || config.long.purchaseUsdt || 0;
    
    // Forzamos el recalculo si hay una posición abierta (ac > 0). 
    if (ac > 0 && latestBotState.lStateData.orderCountInCycle >= 0) { 
        log("Forzando recalculo de RequiredAmount en NO_COVERAGE para asegurar la consistencia del estado.", 'warning');
        
        const recalculation = calculateLongTargets(
            latestBotState.lStateData.ppc || 0, // ✅ AÑADIR || 0
            config.long.profit_percent || 0, // ✅ AÑADIR || 0
            config.long.price_var || 0, // ✅ AÑADIR || 0
            config.long.size_var || 0, // ✅ AÑADIR || 0
            config.long.purchaseUsdt || 0, // ✅ AÑADIR || 0
            latestBotState.lStateData.orderCountInCycle || 0, // ✅ AÑADIR || 0
            latestBotState.lbalance || 0 // ✅ CRÍTICO: AÑADIR || 0
        );
        
        // Actualizamos la variable local con el valor recalculado
        requiredAmount = recalculation.requiredCoverageAmount;
        let nextCoveragePrice = recalculation.nextCoveragePrice; 

        // 🎯 Persistir el valor CORREGIDO
        await updateLStateData({ 
            requiredCoverageAmount: requiredAmount, 
            nextCoveragePrice: nextCoveragePrice 
        });
        
        // 🛑 CRÍTICO 1: Robustez en el log de recalculo
        const safeRequiredAmountLog = requiredAmount && !isNaN(requiredAmount) ? requiredAmount.toFixed(2) : '0.00';
        log(`Required Amount corregido/verificado a ${safeRequiredAmountLog} USDT.`, 'warning');
    }
    // 🛑 FIN DE LA LÓGICA DE RECALCULO FORZADO
    
    const currentLBalance = parseFloat(latestBotState.lbalance || 0); // <-- Usar el LBalance más reciente
    
    // 🛑 CRÍTICO 2: Robustez en el log de diagnóstico
    const safeRequiredAmountDiag = requiredAmount && !isNaN(requiredAmount) ? requiredAmount.toFixed(2) : '0.00';
    log(`[DIAGNÓSTICO BALANCE]: Estado LBalance después de recarga: ${currentLBalance} | Req. Amount: ${safeRequiredAmountDiag} (Verificación)`, 'info');

    
    // ✅ LÓGICA DE TRANSICIÓN FINAL
    // CÓDIGO CORREGIDO PARA TRANSICIÓN ROBUSTA
if (currentLBalance >= requiredAmount && availableUSDT >= requiredAmount && requiredAmount >= MIN_USDT_VALUE_FOR_BITMART) {
    try {
        log(`Balance suficiente (${currentLBalance} asignado, ${availableUSDT} real). Transicionando a BUYING.`, 'success');
        await updateBotState('BUYING', 'long');
    } catch (error) {
        log(`ERROR CRÍTICO: Fallo al actualizar el estado a BUYING. Causa: ${error.message}`, 'error');
    }
    } else {
        // 🛑 LÓGICA DE ESPERA
        let reason = '';
        
        // Formateo seguro para los logs del bloque ELSE (Ya corregido anteriormente)
        const safeRequired = requiredAmount.toFixed(2);
        const safeLBalance = currentLBalance.toFixed(2);
        // 🛑 CRÍTICO 4: Usar operador ternario para el saldo real
        const safeAvailableUSDT = availableUSDT ? availableUSDT.toFixed(2) : 'N/A'; // Evita toFixed en undefined

        if (currentLBalance < requiredAmount) {
            reason = `Esperando reposición de LBalance asignado. (Requiere: ${safeRequired}, Actual: ${safeLBalance})`;
        } else if (availableUSDT < requiredAmount) {
            // Usar la variable formateada con seguridad
            reason = `Esperando reposición de Fondos Reales. (Requiere Real: ${safeRequired}, Actual Real: ${safeAvailableUSDT} | LBalance: ${safeLBalance})`;
        } else {
            // Usar la variable formateada con seguridad
            reason = `Esperando que el Monto Requerido alcance el Mínimo de BitMart (${MIN_USDT_VALUE_FOR_BITMART.toFixed(2)}). Requerido: ${safeRequired}`;
        }
        log(reason, 'info'); 
    } 
} 

module.exports = { run };