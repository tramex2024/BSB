// BSB/server/src/states/long/LNoCoverage.js (Versión Final Sintácticamente Correcta)

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
    
    // ✅ CORRECCIÓN CRÍTICA: Inicialización ÚNICA y SEGURA de requiredAmount.
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

    // 🛑 LAS LÍNEAS DE LOG QUE CAUSABAN EL ERROR 'toFixed' HAN SIDO ELIMINADAS.
    
    // ✅ LÓGICA DE TRANSICIÓN FINAL
// 🛑 CRÍTICO: Simplificamos la condición a solo el LBalance y el mínimo de BitMart.
if (currentLBalance >= requiredAmount && requiredAmount >= MIN_USDT_VALUE_FOR_BITMART) {
    try {
        // Ejecutamos la transición sin logs previos
        await updateBotState('BUYING', 'long');
        
        // Log solo después del éxito, para no interferir con el await
        log(`TRANSICIÓN EXITOSA: El LBalance (${currentLBalance}) es suficiente. Estado actualizado a BUYING.`, 'success');
        
    } catch (error) {
        log(`ERROR CRÍTICO: Fallo al actualizar el estado a BUYING. Causa: ${error.message}`, 'error');
    }
} else {
        // 🛑 LÓGICA DE ESPERA
        let reason = '';
        
        // Formateo seguro para los logs del bloque ELSE
        const safeRequired = requiredAmount.toFixed(2);
        const safeLBalance = currentLBalance.toFixed(2);
        // 🛑 CRÍTICO: Usar operador ternario para el saldo real
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
    } // 🛑 CIERRA EL BLOQUE ELSE
} // 🛑 CIERRA LA FUNCIÓN ASYNC RUN

module.exports = { run };