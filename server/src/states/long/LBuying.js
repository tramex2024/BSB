// BSB/server/src/states/long/LBuying.js (REFACTORIZADO PARA USAR CONSOLIDATOR)

// 🛑 Importaciones Esenciales
const { 
    calculateLongTargets 
} = require('../../utils/dataManager');
const { parseNumber } = require('../../../utils/helpers'); 
// 💡 NUEVAS IMPORTACIONES REQUERIDAS
const { placeFirstBuyOrder, placeCoverageBuyOrder } = require('../../utils/orderManager'); 
// ✅ NUEVA IMPORTACIÓN DEL MÓDULO CONSOLIDATOR
const { monitorAndConsolidate } = require('./LongBuyConsolidator'); 


async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateLStateData, updateGeneralBotState,
        getBotState, 
        availableUSDT 
    } = dependencies;

    // =================================================================
    // === [ PRUEBA TEMPORAL DE PERSISTENCIA DB PARA 'ai' ] ============
    // =================================================================
    // Paso 1: Guardar un valor fijo (3) para 'ai'.
    log("TEST INICIO: Escribiendo 'ai' = 3 en la DB...", 'warning');
    // NOTA: Usamos updateGeneralBotState para el campo top-level 'ai'.
    await updateGeneralBotState({ ai: 3 }); 

    // Paso 2: Leer el estado completo de la DB.
    const latestState = await getBotState(); 
    const testAiValue = latestState.ai;

    // Paso 3: Loguear el valor leído.
    log(`TEST RESULTADO: Valor de 'ai' leído de la DB: ${testAiValue}`, 'warning'); 
    // =================================================================
    // =================================================================


    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const lStateData = botState.lStateData;

    log("Estado Long: BUYING. Verificando el estado de la última orden de compra o gestionando targets...", 'info');

    // =================================================================
    // === [ 0. COLOCACIÓN DE PRIMERA ORDEN (Lógica Integrada) ] ==========
    // =================================================================
    if (lStateData.ppc === 0 && lStateData.orderCountInCycle === 0 && !lStateData.lastOrder) {
        log("Estado de posición inicial detectado. Iniciando lógica de primera compra (Integrada)...", 'warning');

        // 💡 1. RED DE SEGURIDAD 
        if (lStateData.orderCountInCycle > 0) {
            log('Red de seguridad activada: orderCountInCycle ya es > 0, cancelando compra duplicada.', 'warning');
            return; 
        }

        const purchaseAmount = parseFloat(config.long.purchaseUsdt);
        const MIN_USDT_VALUE_FOR_BITMART = 5.00; 
        
        const currentLBalance = parseFloat(botState.lbalance || 0);

        const isRealBalanceSufficient = availableUSDT >= purchaseAmount && purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART;
        const isCapitalLimitSufficient = currentLBalance >= purchaseAmount;
        
        if (isRealBalanceSufficient && isCapitalLimitSufficient) {
            log("Verificaciones de fondos y límite aprobadas. Colocando la primera orden...", 'info');

            // 🎯 Coloca la orden, actualiza lastOrder y descuenta lbalance.
            await placeFirstBuyOrder(config, log, updateBotState, updateGeneralBotState); 
            
            log("Primera orden colocada exitosamente. Esperando al próximo ciclo para monitorear.", 'success');

        } else {
            let reason = '';
            if (!isRealBalanceSufficient) {
                reason = `Fondos REALES (${availableUSDT.toFixed(2)} USDT) insuficientes.`;
            } else if (!isCapitalLimitSufficient) {
                reason = `LÍMITE DE CAPITAL ASIGNADO (${currentLBalance.toFixed(2)} USDT) insuficiente.`;
            }

            log(`No se puede iniciar la orden. ${reason} Cambiando a NO_COVERAGE.`, 'warning');
            await updateBotState('NO_COVERAGE', 'long'); 
        }
        
        return; // Detener el ciclo para esperar la próxima iteración.
    }

    // =================================================================
    // === [ 1. MONITOREO Y CONSOLIDACIÓN DE ORDEN PENDIENTE ] =========
    // =================================================================
    
    const orderIsPendingOrProcessed = await monitorAndConsolidate(
        botState, SYMBOL, log, updateLStateData, updateBotState, updateGeneralBotState
    );
    
    if (orderIsPendingOrProcessed) {
        // Si el consolidator encuentra una orden (pendiente, fallida o exitosa), 
        // él maneja el flujo de estado (RUNNING, BUYING, etc.). Salimos del ciclo 'run'.
        return; 
    }
    
    // Si no hay orden pendiente (lastOrder es null), procedemos a calcular los targets.
    
    // =================================================================
    // === [ 2. CÁLCULO Y GESTIÓN DE TARGETS ] ===========================
    // =================================================================
    if (!lStateData.lastOrder && lStateData.ppc > 0) { 
        log("Calculando objetivos iniciales (Venta/Cobertura) y Límite de Cobertura...", 'info');
    
        const { 
            targetSellPrice, 
            nextCoveragePrice, 
            requiredCoverageAmount, 
            lCoveragePrice,     
            lNOrderMax            
        } = calculateLongTargets(
            lStateData.ppc, 
            config.long.profit_percent, 
            config.long.price_var, 
            config.long.size_var,
            config.long.purchaseUsdt,
            lStateData.orderCountInCycle,
            botState.lbalance 
        );

        // 🎯 ACTUALIZACIÓN ATÓMICA DE TARGETS
        const targetsUpdate = {
            ltprice: targetSellPrice,
            lcoverage: lCoveragePrice, 
            lnorder: lNOrderMax,          
            // Campos de lStateData
            'lStateData.requiredCoverageAmount': requiredCoverageAmount,
            'lStateData.nextCoveragePrice': nextCoveragePrice,
        };

        await updateGeneralBotState(targetsUpdate);

        // 💡 LUEGO DE ACTUALIZAR LA DB, ACTUALIZAMOS LA REFERENCIA LOCAL
        lStateData.requiredCoverageAmount = requiredCoverageAmount; 
        lStateData.nextCoveragePrice = nextCoveragePrice;

        // 🟢 LOG RESUMEN DE TARGETS
        const logSummary = `
            Estrategia LONG: Targets y Cobertura actualizados.
            ------------------------------------------
            💰 PPC actual: ${lStateData.ppc.toFixed(2)} USD (AC: ${lStateData.ac.toFixed(8)} BTC).
            🎯 TP Objetivo (Venta): ${targetSellPrice.toFixed(2)} USD.
            📉 Proxima Cobertura (DCA): ${nextCoveragePrice.toFixed(2)} USD (Monto: ${requiredCoverageAmount.toFixed(2)} USDT).
            🛡️ Cobertura Máxima (L-Coverage): ${lCoveragePrice.toFixed(2)} USD (Órdenes restantes posibles: ${lNOrderMax}).
        `.replace(/\s+/g, ' ').trim();
        log(logSummary, 'warning'); 

    } else if (!lStateData.lastOrder && lStateData.ppc === 0) {
        log("Posición inicial (AC=0). Targets no calculados. Esperando señal de entrada.", 'info');
    }

    // =================================================================
    // === [ 3. EVALUACIÓN DE TRANSICIÓN DE ESTADO/COLOCACIÓN DE ORDEN ] =
    // =================================================================
    
    // 3A. Transición a SELLING por Take Profit (ltprice alcanzado)
    if (botState.ltprice > 0 && currentPrice >= botState.ltprice) {
        log(`[LONG] ¡TARGET DE VENTA (Take Profit) alcanzado! Precio actual: ${currentPrice.toFixed(2)} >= ${botState.ltprice.toFixed(2)}. Transicionando a SELLING.`, 'success');
        
        await updateBotState('SELLING', 'long');
        return;
    }

    // 3B. Colocación de ORDEN de COBERTURA (DCA)
    const requiredAmount = lStateData.requiredCoverageAmount;

    if (!lStateData.lastOrder && lStateData.nextCoveragePrice > 0 && currentPrice <= lStateData.nextCoveragePrice) {
        
        if (requiredAmount <= 0) {
            log(`Error CRÍTICO: El monto requerido para la cobertura es cero (0). Verifique config.long.purchaseUsdt. Transicionando a NO_COVERAGE.`, 'error');
            await updateBotState('NO_COVERAGE', 'long'); 
            return; 
        }

        if (botState.lbalance >= requiredAmount) {
            log(`[LONG] ¡Precio de COBERTURA alcanzado! Precio actual: ${currentPrice.toFixed(2)} <= ${lStateData.nextCoveragePrice.toFixed(2)}. Colocando orden de compra.`, 'warning');
            
            try {
                await placeCoverageBuyOrder(botState, requiredAmount, lStateData.nextCoveragePrice, log, updateGeneralBotState, updateBotState);
                
            } catch (error) {
                log(`Error CRÍTICO al colocar la orden de COBERTURA: ${error.message}.`, 'error');
            }
            return; // Esperar el próximo ciclo para monitorear la orden.

        } else {
            log(`Advertencia: Precio de cobertura alcanzado (${lStateData.nextCoveragePrice.toFixed(2)}), pero no hay suficiente capital disponible (${botState.lbalance.toFixed(2)} USDT). Transicionando a NO_COVERAGE.`, 'error');
            await updateBotState('NO_COVERAGE', 'long');
            return;
        }
    }
    
    // 3C. Transición por defecto o Log final (Permanece en BUYING)
    
    if (!lStateData.lastOrder && lStateData.ppc > 0) {
        log(`Monitoreando... Venta: ${botState.ltprice.toFixed(2)}, Cobertura: ${lStateData.nextCoveragePrice.toFixed(2)}. Esperando que el precio caiga o suba.`, 'debug');
        return; // Permanece en el estado BUYING
    }

    log(`Monitoreando... Venta: ${botState.ltprice.toFixed(2)}, Cobertura: ${lStateData.nextCoveragePrice.toFixed(2)}.`, 'debug');
}

module.exports = { run };