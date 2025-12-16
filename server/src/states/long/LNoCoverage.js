// BSB/server/src/states/long/LNoCoverage.js (Versión Final Corregida y Optimizada)

const MIN_USDT_VALUE_FOR_BITMART = 5.0;
const { calculateLongTargets } = require('../../../autobotCalculations');

async function run(dependencies) {
    const { 
        botState, currentPrice, config, log, 
        updateBotState, updateLStateData,
        getBotState 
    } = dependencies;
    
    // ✅ CRÍTICO: Garantizamos que availableUSDT siempre es un número (0 si falla la API, 
    // o el valor real si la API funciona correctamente - 65.94 en tu caso).
    const availableUSDT = parseFloat(dependencies.availableUSDT || 0);

    //log("[L] NO_COVERAGE: Esperando fondos o precio de venta.", 'warning');

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
    
    let requiredAmount = latestBotState.lStateData.requiredCoverageAmount || config.long.purchaseUsdt || 0;
    
    // Forzamos el recalculo si hay una posición abierta (ac > 0). 
    if (ac > 0 && latestBotState.lStateData.orderCountInCycle >= 0) { 
 //       log("Forzando recalculo de RequiredAmount en NO_COVERAGE para asegurar la consistencia del estado.", 'warning');
        
        const recalculation = calculateLongTargets(
            latestBotState.lStateData.ppc || 0,
            config.long.profit_percent || 0,
            config.long.price_var || 0,
            config.long.size_var || 0,
            config.long.purchaseUsdt || 0,
            latestBotState.lStateData.orderCountInCycle || 0,
            latestBotState.lbalance || 0
        );
        
        requiredAmount = recalculation.requiredCoverageAmount;
        let nextCoveragePrice = recalculation.nextCoveragePrice; 

        // 🎯 Persistir el valor CORREGIDO
        await updateLStateData({ 
            requiredCoverageAmount: requiredAmount, 
            nextCoveragePrice: nextCoveragePrice 
        });
        
        const safeRequiredAmountLog = requiredAmount && !isNaN(requiredAmount) ? requiredAmount.toFixed(2) : '0.00';
   //     log(`Required Amount corregido/verificado a ${safeRequiredAmountLog} USDT.`, 'warning');
    }
    // 🛑 FIN DE LA LÓGICA DE RECALCULO FORZADO
    
    const currentLBalance = parseFloat(latestBotState.lbalance || 0);
    
    const safeRequiredAmountDiag = requiredAmount && !isNaN(requiredAmount) ? requiredAmount.toFixed(2) : '0.00';
    log(`[L] NO_COVERAGE: Estado LBalance después de recarga: ${currentLBalance} | Req. Amount: ${safeRequiredAmountDiag} (Verificación)`, 'info');

    
    // ✅ LÓGICA DE TRANSICIÓN FINAL CORREGIDA
    // Ahora verifica: Balance Contable (lbalance) Y Balance Real (availableUSDT) Y Mínimo de BitMart.
    if (currentLBalance >= requiredAmount && availableUSDT >= requiredAmount && requiredAmount >= MIN_USDT_VALUE_FOR_BITMART) {
        try {
            log(`¡Fondos disponibles! Transicionando de NO_COVERAGE a BUYING. (Balance Real: ${availableUSDT.toFixed(2)})`, 'success');
            await updateBotState('BUYING', 'long');
        } catch (error) {
            log(`ERROR CRÍTICO: Fallo al actualizar el estado a BUYING. Causa: ${error.message}`, 'error');
        }
    } else {
        // 🛑 LÓGICA DE ESPERA (COMENTADA TEMPORALMENTE para evitar el error 'toFixed')
        // La transición no se hizo. El bot permanecerá en NO_COVERAGE hasta el próximo ciclo.
        
        const safeRequired = (requiredAmount || 0).toFixed(2);
        const safeLBalance = (currentLBalance || 0).toFixed(2);
        const safeAvailableUSDT = (availableUSDT || 0).toFixed(2);

        let reason = '';
        if (currentLBalance < requiredAmount) {
            reason = `Esperando reposición de LBalance asignado. (Requiere: ${safeRequired}, Asignado: ${safeLBalance}, Real: ${safeAvailableUSDT})`;
        } else if (availableUSDT < requiredAmount) {
            reason = `Esperando reposición de Fondos Reales. (Requiere Real: ${safeRequired}, Real: ${safeAvailableUSDT}, Asignado: ${safeLBalance})`;
        } else {
            reason = `Esperando que el Monto Requerido alcance el Mínimo de BitMart (${(MIN_USDT_VALUE_FOR_BITMART || 0).toFixed(2)}). Requerido: ${safeRequired}`;
        }
   //     log(reason, 'info'); 
    } 
} 

module.exports = { run };