// BSB/server/src/states/long/LBuying.js (CORREGIDO)

const { calculateLongTargets } = require('../../../autobotCalculations');
const { parseNumber } = require('../../../utils/helpers'); 
// 💡 NUEVAS IMPORTACIONES REQUERIDAS
const { placeFirstBuyOrder, placeCoverageBuyOrder } = require('../../managers/longOrderManager'); 
// ✅ NUEVA IMPORTACIÓN DEL MÓDULO CONSOLIDATOR
const { monitorAndConsolidate } = require('./LongBuyConsolidator'); 

async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateLStateData, updateGeneralBotState,
        getBotState, 
        availableUSDT // ✅ BALANCE REAL DEL EXCHANGE
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const lStateData = botState.lStateData;

    // =================================================================
    // === [ 0. COLOCACIÓN DE PRIMERA ORDEN (Lógica Integrada) ] ==========
    // =================================================================
    // La condición lStateData.ppc === 0 y !lStateData.lastOrder define la entrada al ciclo.
    if (lStateData.ppc === 0 && !lStateData.lastOrder) {
        log("Estado de posición inicial detectado. Iniciando lógica de primera compra (Integrada)...", 'warning');

        // 🛑 [Líneas 47-50 ELIMINADAS] - El chequeo de orderCountInCycle > 0 es redundante aquí.

        const purchaseAmount = parseFloat(config.long.purchaseUsdt);
        const MIN_USDT_VALUE_FOR_BITMART = 5.00;  // Mejor usar la constante importada si existe
        
        const currentLBalance = parseFloat(botState.lbalance || 0);

        const isRealBalanceSufficient = availableUSDT >= purchaseAmount && purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART;
        const isCapitalLimitSufficient = currentLBalance >= purchaseAmount;
        
        if (isRealBalanceSufficient && isCapitalLimitSufficient) {
            log("Verificaciones de fondos y límite aprobadas. Colocando la primera orden...", 'info');

            // 🎯 Coloca la orden, actualiza lastOrder y descuenta lbalance.
            await placeFirstBuyOrder(config, botState, log, updateBotState, updateGeneralBotState); 
            
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
        // El consolidator maneja el flujo de estado. Salimos del ciclo 'run'.
        return; 
    }
    
    // =================================================================
    // === [ 2. GESTIÓN DE TARGETS: SOLO LOG Y CHEQUEO ] =================
    // =================================================================
    // 🛑 CORRECCIÓN DE EFICIENCIA: Si el PPC > 0, los targets ya fueron calculados
    // y actualizados por LongDataManager.js después de la consolidación.
    // Solo necesitamos loguearlos.
    
    if (lStateData.ppc > 0) { 

        // Si los targets están vacíos por alguna razón, los re-calculamos como contingencia:
        if (botState.ltprice === 0 || lStateData.nextCoveragePrice === 0) {
            log("ADVERTENCIA: Targets están en 0 después de Consolidación. Recalculando targets como contingencia.", 'warning');

            const { 
            targetSellPrice, nextCoveragePrice, requiredCoverageAmount, lCoveragePrice, lNOrderMax            
            } = calculateLongTargets(
                lStateData.ppc, config.long.profit_percent, config.long.price_var, config.long.size_var,
                config.long.purchaseUsdt, lStateData.orderCountInCycle, botState.lbalance,
                lStateData.lastExecutionPrice 
            );

            const targetsUpdate = {
                ltprice: targetSellPrice, lcoverage: lCoveragePrice, lNOrderMax: lNOrderMax,
                'lStateData.requiredCoverageAmount': requiredCoverageAmount,
                'lStateData.nextCoveragePrice': nextCoveragePrice,
            };

            await updateGeneralBotState(targetsUpdate);
            // Re-hidratamos la referencia local por si el siguiente bloque lo necesita
            botState.ltprice = targetSellPrice;
            lStateData.nextCoveragePrice = nextCoveragePrice;
            lStateData.requiredCoverageAmount = requiredCoverageAmount;
        }

        // 🟢 LOG RESUMEN DE TARGETS (Usamos los valores ya cargados/recalculados)
        const logSummary = `
            [L] BUYING:            
            💰 PPC actual: ${lStateData.ppc.toFixed(2)} USD (AC: ${lStateData.ac.toFixed(8)} BTC).
            🎯 TP Objetivo (Venta): ${botState.ltprice.toFixed(2)} USD.
            📉 Proxima Cobertura (DCA): ${lStateData.nextCoveragePrice.toFixed(2)} USD (Monto: ${lStateData.requiredCoverageAmount.toFixed(2)} USDT).
            🛡️ Cobertura Máxima (L-Coverage): ${botState.lcoverage.toFixed(2)} USD (Órdenes restantes posibles: ${botState.lnorder}).
        `.replace(/\s+/g, ' ').trim();
        log(logSummary, 'debug'); 

    } else if (!lStateData.lastOrder && lStateData.ppc === 0) {
        log("Posición inicial (AC=0). Targets no activos. Esperando señal de entrada.", 'info');
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

        // 🛑 [Verificación de Balance Real y Asignado]
        if (botState.lbalance >= requiredAmount && availableUSDT >= requiredAmount) {
            log(`[LONG] ¡Precio de COBERTURA alcanzado! Precio actual: ${currentPrice.toFixed(2)} <= ${lStateData.nextCoveragePrice.toFixed(2)}. Colocando orden de compra.`, 'warning');
            
            try {
                // placeCoverageBuyOrder deduce lbalance y actualiza lastOrder atómicamente.
                await placeCoverageBuyOrder(botState, requiredAmount, log, updateGeneralBotState, updateBotState);
                
            } catch (error) {
                log(`Error CRÍTICO al colocar la orden de COBERTURA: ${error.message}.`, 'error');
            }
            return; // Esperar el próximo ciclo para monitorear la orden.

        } else {
            let reason = '';
            if (botState.lbalance < requiredAmount) {
                reason = `Límite asignado (LBalance: ${botState.lbalance.toFixed(2)} USDT) insuficiente.`;
            } else {
                reason = `Fondos reales (Exchange: ${availableUSDT.toFixed(2)} USDT) insuficientes.`;
            }
            
            log(`Advertencia: Precio de cobertura alcanzado (${lStateData.nextCoveragePrice.toFixed(2)}). ${reason} Transicionando a NO_COVERAGE.`, 'error');
            await updateBotState('NO_COVERAGE', 'long');
            return;
        }
    }
    
    // 3C. Transición por defecto o Log final (Permanece en BUYING)
    
    if (!lStateData.lastOrder && lStateData.ppc > 0) {
        // Log ya se hizo arriba, evitamos el log final redundante.
        return; // Permanece en el estado BUYING
    }

    log(`[L]BUYING: Monitoreando...`, 'debug');
}

module.exports = { run };