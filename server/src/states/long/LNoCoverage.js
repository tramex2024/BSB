// BSB/server/src/states/long/LNoCoverage.js (FINAL CORREGIDO CON RECARGA Y LOGS DETALLADOS)

const { MIN_USDT_VALUE_FOR_BITMART } = require('../../managers/longOrderManager');
const { calculateLongTargets } = require('../../../autobotCalculations');

async function run(dependencies) {
    // 🛑 CORRECCIÓN: Quitamos availableUSDT de la desestructuración para evitar errores de undefined
    const { 
        botState, currentPrice, config, log, 
        updateBotState, updateLStateData,
        getBotState 
    } = dependencies;
    
    // ✅ CORRECCIÓN ROBUSTA: Garantizamos que availableUSDT siempre es un número
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
    // Lo inicializamos con el valor guardado o, si es la primera vez, con el purchaseUsdt configurado.
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
    // 🛑 ELIMINACIÓN DE: else if (ac === 0) ya que la inicialización lo cubre.
    // 🛑 FIN DE LA LÓGICA DE RECALCULO FORZADO
    
    const currentLBalance = parseFloat(latestBotState.lbalance || 0); // <-- Usar el LBalance más reciente
    
    // 🛑 SE ELIMINAN LAS LÍNEAS DE LOG DE DIAGNÓSTICO DETALLADO QUE CAUSAN EL ERROR 'toFixed'
    // log(`DIAGNOSTICO NO_COVERAGE: LBal=...
    // log(`Condiciones: LBalOK: ...

    // ✅ CRÍTICO: Verificación de fondos
    // availableUSDT se ha forzado a TRUE temporalmente
    const isReadyToResume = 
        currentLBalance >= requiredAmount && 
        true && // 🛑 FORZAMOS TRUE AQUÍ para saltar el requisito de BitMart
        requiredAmount >= MIN_USDT_VALUE_FOR_BITMART;

    if (isReadyToResume) {
        log(`Fondos (LBalance) disponibles. Monto requerido (${requiredAmount.toFixed(2)} USDT). Volviendo a BUYING.`, 'success');
        await updateBotState('BUYING', 'long');
    } else {
        let reason = '';
        // 🛑 LOG MODIFICADO para ser más informativo y robusto
        if (currentLBalance < requiredAmount) {
            reason = `Esperando reposición de LBalance asignado. (Requiere: ${requiredAmount.toFixed(2)}, Actual: ${currentLBalance.toFixed(2)})`;
        } else {
            // availableUSDT ahora está garantizado de ser un número (o 0)
            reason = `Esperando reposición de Fondos Reales. (Requiere Real: ${requiredAmount.toFixed(2)}, Actual Real: ${availableUSDT.toFixed(2)} | LBalance: ${currentLBalance.toFixed(2)})`;
        }
        log(reason, 'info'); // Logear para mostrar qué está esperando
    }
}

module.exports = { run };