// BSB/server/src/states/long/LNoCoverage.js (AJUSTADO PARA MODELO SIMPLIFICADO)

// 💡 Nota: Asegúrate de importar MIN_USDT_VALUE_FOR_BITMART donde esté definida
// (Se asume que está en '../../utils/config.js' o similar, no en orderManager)
const { MIN_USDT_VALUE_FOR_BITMART } = require('../../../services/bitmartSpot'); // O donde esté definida
const { calculateLongTargets } = require('../../utils/dataManager');

async function run(dependencies) {
    // Extraemos las funciones y el estado de las dependencias
    const { botState, currentPrice, availableUSDT, config, log, updateBotState, updateLStateData } = dependencies;

    log("Estado Long: NO_COVERAGE. Esperando fondos o precio de venta.", 'warning');

    const { ac } = botState.lStateData;
    
    // --- 1. VERIFICACIÓN DE TRANSICIÓN A VENTA (Ganancia alcanzada) ---
    // Implementa la lógica de monitoreo de TP (Regla #4: Pausa Activa)
    const targetSellPrice = botState.ltprice || 0; 

    // Solo verificamos la venta si hay una posición abierta
    if (ac > 0 && targetSellPrice > 0 && currentPrice >= targetSellPrice) {
        log(`Precio actual alcanzó el objetivo de venta (${targetSellPrice.toFixed(2)}) desde NO_COVERAGE. Transicionando a SELLING.`, 'success');
        await updateBotState('SELLING', 'long'); 
        return;
    }

    // --- 2. LÓGICA DE RECALCULO Y VERIFICACIÓN DE FONDOS ---
    
    let requiredAmount = botState.lStateData.requiredCoverageAmount || 0;
    
    if (ac > 0) {
        // Lógica de recalculo si hay una posición abierta (ac > 0)
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

        // 🎯 Persistir el valor CORREGIDO (Incluye nextCoveragePrice)
        await updateLStateData({ 
            requiredCoverageAmount: requiredAmount, 
            nextCoveragePrice: nextCoveragePrice 
        });
        
        log(`Required Amount corregido/verificado a ${requiredAmount.toFixed(2)} USDT.`, 'warning');
    }
    // LÓGICA PARA ESTADO INICIAL (ac = 0)
    else if (ac === 0) {
        // Si no hay posición, el requiredAmount es el monto de la primera compra.
        requiredAmount = parseFloat(config.long.purchaseUsdt);
        log(`Posición reseteada (AC=0). Monto Requerido forzado a: ${requiredAmount.toFixed(2)} USDT (Primera Compra).`, 'info');
    }

    // --- 3. VERIFICACIÓN DE TRANSICIÓN A COMPRA (Fondos recuperados) ---
    const currentLBalance = parseFloat(botState.lbalance || 0);
    
    // ✅ CRÍTICO: Chequeo para reanudar la compra.
    const isReadyToResume = 
        currentLBalance >= requiredAmount && 
        availableUSDT >= requiredAmount && 
        requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (isReadyToResume) {
        log(`Fondos (LBalance y Real) recuperados/disponibles. Monto requerido (${requiredAmount.toFixed(2)} USDT). Volviendo a BUYING.`, 'success');
        
        // 🎯 ACCIÓN CLAVE: SOLO TRANSICIONAR EL ESTADO (LBuying se encargará de la orden)
        await updateBotState('BUYING', 'long'); 
    } else {
         let reason = '';
         if (currentLBalance < requiredAmount) {
             reason = `Esperando reposición de LBalance asignado. (Requiere: ${requiredAmount.toFixed(2)}, Actual: ${currentLBalance.toFixed(2)})`;
         } else {
             reason = `Esperando reposición de Fondos Reales. (Requiere: ${requiredAmount.toFixed(2)}, Actual: ${availableUSDT.toFixed(2)})`;
         }
         log(reason, 'info'); // Loggear para mostrar qué está esperando
    }
}

module.exports = { run };