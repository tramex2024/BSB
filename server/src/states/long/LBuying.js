// BSB/server/src/states/long/LBuying.js (ETAPA 2: Lógica de Inicio Integrada)

// 🛑 Importaciones Esenciales
const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService'); 
const { 
    calculateLongTargets 
} = require('../../utils/dataManager');
const { parseNumber } = require('../../../utils/helpers'); 
// 💡 NUEVAS IMPORTACIONES REQUERIDAS por la integración de la lógica de inicio
const { placeFirstBuyOrder, placeCoverageBuyOrder } = require('../../utils/orderManager'); 

/**
 * Función central de la estrategia Long en estado BUYING.
 * Gestiona: 1. La recuperación/confirmación de órdenes de compra pendientes. 
 * 2. La consolidación de la posición (ppc/ac).
 * 3. El cálculo y establecimiento de targets (ltprice, nextCoveragePrice).
 * 4. La colocación de la PRIMERA ORDEN (si viene de RUNNING).
 */
async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateLStateData, updateGeneralBotState,
        getBotState,
        availableUSDT // Requerida para la verificación de fondos en la Sección 0
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const lStateData = botState.lStateData;

    log("Estado Long: BUYING. Verificando el estado de la última orden de compra o gestionando targets...", 'info');

    // =================================================================
    // === [ 0. COLOCACIÓN DE PRIMERA ORDEN (Lógica Integrada) ] ==========
    // =================================================================
    // Si no hay posición y no hay orden pendiente (viene de LRunning con señal 'BUY'), se inicia.
    if (lStateData.ppc === 0 && lStateData.orderCountInCycle === 0 && !lStateData.lastOrder) {
        log("Estado de posición inicial detectado. Iniciando lógica de primera compra (Integrada)...", 'warning');

        // 💡 1. RED DE SEGURIDAD (Se mantiene la lógica original de LRunning por seguridad)
        if (lStateData.orderCountInCycle > 0) {
            log('Red de seguridad activada: orderCountInCycle ya es > 0, cancelando compra duplicada.', 'warning');
            return; 
        }

        const purchaseAmount = parseFloat(config.long.purchaseUsdt);
        // Usamos la constante de BitMart para el mínimo
        const MIN_USDT_VALUE_FOR_BITMART = 5.00; 
        
        // ⚠️ VERIFICACIÓN DEL LÍMITE DE CAPITAL (LBalance)
        const currentLBalance = parseFloat(botState.lbalance || 0);

        const isRealBalanceSufficient = availableUSDT >= purchaseAmount && purchaseAmount >= MIN_USDT_VALUE_FOR_BITMART;
        const isCapitalLimitSufficient = currentLBalance >= purchaseAmount;
        
        if (isRealBalanceSufficient && isCapitalLimitSufficient) {
            log("Verificaciones de fondos y límite aprobadas. Colocando la primera orden...", 'info');

            // 🎯 Coloca la orden, actualiza lastOrder y descuenta lbalance.
            await placeFirstBuyOrder(config, log, updateBotState, updateGeneralBotState); 
            
            // Si es exitoso, volvemos para monitorear la orden.
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
    // === [ 1. MONITOREO DE ORDEN DE COMPRA PENDIENTE ] =================
    // =================================================================
    const lastOrder = lStateData.lastOrder;

    if (lastOrder && lastOrder.order_id && lastOrder.side === 'buy') {
        const orderIdString = String(lastOrder.order_id);
        log(`Recuperación: Orden de compra pendiente con ID ${orderIdString} detectada en DB. Consultando BitMart...`, 'warning');

        try {
            
            // 1. Intentar la consulta directa por ID
            let orderDetails = await getOrderDetail(SYMBOL, orderIdString);
            let finalDetails = orderDetails;
            let isOrderProcessed = false;
            let filledVolume = parseFloat(finalDetails?.filledVolume || 0); 
            
            // 🛑 Criterio inicial de éxito/procesamiento
            if (finalDetails) {
                isOrderProcessed = (
                    finalDetails.state === 'filled' || 
                    finalDetails.state === 'partially_canceled' || 
                    (finalDetails.state === 'canceled' && filledVolume > 0) ||
                    filledVolume > 0 
                );
            }
            

            // ======================================================
            // 💡 LÓGICA DE RESPALDO (si la consulta directa falla o es incompleta)
            // ======================================================
            if (!isOrderProcessed) {
                log(`Fallo/inconcluso en consulta directa. Buscando orden ${orderIdString} en el historial de BitMart...`, 'warning');
                
                // 2. Buscar en el historial
                const recentOrders = await getRecentOrders(SYMBOL); 
                finalDetails = recentOrders.find(order => order.orderId === orderIdString || order.order_id === orderIdString); // Buscar por ambos campos por seguridad
                
                if (finalDetails) {
                    filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0); // Asumiendo que filledVolume/filledSize son campos de historial
                    isOrderProcessed = filledVolume > 0;
                    
                    if (isOrderProcessed) {
                        log(`Orden ${orderIdString} encontrada y confirmada como llenada en el historial (Volumen llenado: ${filledVolume}).`, 'success');
                    }
                }
            }


            if (isOrderProcessed) {
                // Usamos priceAvg si está disponible, si no, el precio (mejor para órdenes de mercado)
                const averagePrice = parseFloat(finalDetails.priceAvg || finalDetails.price || 0);
                
                // Si filledVolume es 0, a pesar de las banderas, no procesamos.
                if (filledVolume === 0) {
                    log(`Error: Orden ID ${orderIdString} cancelada o no ejecutada (Volumen 0). Limpiando lastOrder.`, 'error');
                    await updateLStateData({ 'lastOrder': null });
                    await updateBotState('RUNNING', 'long');
                    return;
                }

                log(`Recuperación exitosa: La orden ID ${orderIdString} se completó. Procesando consolidación...`, 'success');

                // === LÓGICA DE CONSOLIDACIÓN DE POSICIÓN (CRÍTICA) ===
                const oldAc = lStateData.ac || 0;
                const oldPpc = lStateData.ppc || 0;
                
                // 1. Calcular el nuevo PPC (Precio Promedio de Compra)
                const totalSpentOld = oldAc * oldPpc;
                const totalSpentNew = filledVolume * averagePrice;
                const newAc = oldAc + filledVolume;
                
                let newPpc = 0;
                if (newAc > 0) {
                    newPpc = (totalSpentOld + totalSpentNew) / newAc;
                }
                
                // 2. Calcular el nuevo Balance y Total Gastado (usamos executedValue si está disponible, si no, lo calculamos)
                const totalUsdtUsed = parseFloat(finalDetails.executedValue || finalDetails.executed_value || (filledVolume * averagePrice));
                // lastOrder.usdt_amount es el monto inicial de la orden.
                const newLBalance = (botState.lbalance || 0) + (parseNumber(lastOrder.usdt_amount) - totalUsdtUsed); // Reintegramos el USDT no usado
                
                log(`[AUDITORÍA 1/3] -> ANTES de guardar. PPC a guardar: ${newPpc.toFixed(2)}, AC a guardar: ${newAc.toFixed(8)}, LState: BUYING`, 'debug');

                // 3. 🎯 CREACIÓN DE LA ACTUALIZACIÓN ATÓMICA DE DATOS
                const atomicUpdate = {
                    // Actualización del estado general
                    lbalance: newLBalance,
                    lnorder: (botState.lnorder || 0) + 1, // Se ha ejecutado una orden más
                    
                    // Actualización de LStateData (debe ser un objeto para la notación de punto)
                    'lStateData.ppc': newPpc,
                    'lStateData.ac': newAc,
                    'lStateData.orderCountInCycle': (lStateData.orderCountInCycle || 0) + 1,
                    'lStateData.lastOrder': null // ✅ Limpiamos la orden, ya se procesó con éxito.
                };

                // 4. Aplicar la actualización atómica
                await updateGeneralBotState(atomicUpdate);
                
                log(`[AUDITORÍA 2/3] -> DESPUÉS de guardar (Objeto en memoria). PPC: ${newPpc.toFixed(2)}, AC: ${newAc.toFixed(8)}, LState: BUYING`, 'debug');

                // 5. Verificación (Opcional, pero útil para depuración)
                if (getBotState) {
                    const updatedBotState = await getBotState();
                    log(`[AUDITORÍA 3/3] -> VERIFICACIÓN EN DB. PPC leído: ${updatedBotState.lStateData.ppc.toFixed(2)}, AC leído: ${updatedBotState.lStateData.ac.toFixed(8)}, LState: ${updatedBotState.lstate}`, 'debug');
                } else {
                    log(`[AUDITORÍA 3/3] -> VERIFICACIÓN OMITIDA. getBotState no está disponible en las dependencias.`, 'debug');
                }

                log(`[LONG] Orden de COMPRA confirmada. Nuevo PPC: ${newPpc.toFixed(2)}, Qty Total (AC): ${newAc.toFixed(8)}. Precio de ejecución: ${averagePrice.toFixed(2)}. Transicionando a RUNNING.`, 'success');
                
                // 🎯 Transición inmediata a RUNNING 
                await updateBotState('RUNNING', 'long'); 
                return; // 🛑 Salir después de consolidar una orden.

            } else if (finalDetails && (finalDetails.state === 'new' || finalDetails.state === 'partially_filled')) {
                // ⏸️ Orden activa/parcialmente ejecutada. Persistir.
                log(`La orden ID ${orderIdString} sigue activa (${finalDetails.state}). Esperando ejecución.`, 'info');
                return;
            } else {
                // ❌ Otros estados de error final SIN NINGUNA ejecución. Limpiamos.
                log(`La orden ID ${orderIdString} tuvo un estado de error final sin ejecución o es desconocida. Limpiando lastOrder. Estado BitMart: ${finalDetails?.state || 'N/A'}`, 'error');
                await updateLStateData({ 'lastOrder': null });
                await updateBotState('RUNNING', 'long'); // Se puede ir a RUNNING para reevaluar la situación
                return;
            }

        } catch (error) {
            log(`Error de API al consultar la orden ${orderIdString} o en lógica de respaldo: ${error.message}. Persistiendo y reintentando en el próximo ciclo...`, 'error');
            return;
        }
    }
    
    // Si la última orden de compra ya se procesó (lastOrder es null), procedemos a calcular los targets.
    
    // =================================================================
    // === [ 2. CÁLCULO Y GESTIÓN DE TARGETS ] ===========================
    // =================================================================
    if (!lStateData.lastOrder && lStateData.ppc > 0) { 
        log("Calculando objetivos iniciales (Venta/Cobertura) y Límite de Cobertura...", 'info');
    
        const { 
            targetSellPrice, 
            nextCoveragePrice, 
            requiredCoverageAmount, 
            lCoveragePrice,      // <-- Captura el nuevo LCoverage (Precio)
            lNOrderMax           // <-- Captura el nuevo LNOrder (Cantidad)
        } = calculateLongTargets(
            lStateData.ppc, 
            config.long.profit_percent, 
            config.long.price_var, 
            config.long.size_var,
            config.long.purchaseUsdt,
            lStateData.orderCountInCycle,
            botState.lbalance // <== ¡CRÍTICO: Pasar el LBalance!
        );

        // 🎯 ACTUALIZACIÓN ATÓMICA DE TARGETS
        const targetsUpdate = {
            ltprice: targetSellPrice,
            lcoverage: lCoveragePrice, // Ahora almacena el precio límite
            lnorder: lNOrderMax,         // Ahora almacena el total de órdenes posibles

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
                // ✅ CORRECCIÓN CRÍTICA: Se añade la dependencia updateBotState a la llamada
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
    
    // Si la última orden fue limpiada y tenemos una posición (ppc > 0), nos quedamos en BUYING
    if (!lStateData.lastOrder && lStateData.ppc > 0) {
        log(`Monitoreando... Venta: ${botState.ltprice.toFixed(2)}, Cobertura: ${lStateData.nextCoveragePrice.toFixed(2)}. Esperando que el precio caiga o suba.`, 'debug');
        return; // Permanece en el estado BUYING
    }

    log(`Monitoreando... Venta: ${botState.ltprice.toFixed(2)}, Cobertura: ${lStateData.nextCoveragePrice.toFixed(2)}.`, 'debug');
}

module.exports = { run };