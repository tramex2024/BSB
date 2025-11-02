// BSB/server/src/states/long/LBuying.js (FINAL OPTIMIZADO)

// 🛑 IMPORTACIONES CRÍTICAS
const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService'); 
const { 
    calculateLongTargets 
} = require('../../../utils/autobotCalculations');
const { parseNumber } = require('../../../utils/helpers'); 
const { placeFirstBuyOrder, placeCoverageBuyOrder } = require('../../utils/orderManager'); 


/**
 * Función central de la estrategia Long en estado BUYING.
 */
async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateGeneralBotState, getBotState,
        creds
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    let lStateData = botState.lStateData; 
    let currentLBalance = parseNumber(botState.lbalance || 0);

    log("Estado Long: BUYING. Verificando el estado de la última orden de compra o gestionando targets...", 'info');

    // =================================================================
    // === [ 1. MONITOREO DE ORDEN DE COMPRA PENDIENTE ] =================
    // =================================================================
    const lastOrder = lStateData.lastOrder;

    if (lastOrder && lastOrder.order_id && lastOrder.side === 'buy') {
        const orderIdString = String(lastOrder.order_id);
        log(`Recuperación: Orden de compra pendiente ID ${orderIdString} detectada. Consultando BitMart...`, 'warning');

        try {
            let finalDetails = null;

            // 1. Intentar la consulta directa por ID
            try {
                let orderDetails = await getOrderDetail(SYMBOL, orderIdString);
                finalDetails = orderDetails;
            } catch (e) {
                // Posible error 50005 (orden completada/no encontrada). Buscamos en el historial.
                log(`Consulta directa falló (${e.message}). Buscando en el historial...`, 'warning');
            }

            // 2. Lógica de Respaldo: Si la consulta directa falló o el estado es ambiguo.
            if (!finalDetails) {
                const recentOrders = await getRecentOrders(creds, SYMBOL); 
                finalDetails = recentOrders.find(order => String(order.orderId) === orderIdString || String(order.order_id) === orderIdString);
            }

            if (!finalDetails) {
                log(`ERROR FATAL: No se pudo recuperar la orden ID ${orderIdString} en consulta directa ni en historial. Reintentando.`, 'error');
                return;
            }
            
            // 3. Evaluar el resultado final (LÓGICA MEJORADA)
            
            // 3A. Extracción de datos
            const currentOrderState = finalDetails.state || 'N/A';
            const filledVolume = parseNumber(finalDetails.filledVolume || finalDetails.filledSize || finalDetails.executed_volume || 0); 
            const amountTotal = parseNumber(finalDetails.size || 0); // La cantidad total de BTC solicitada ('size' en BitMart)
            
            // 3B. Criterios de Finalización
            // Usamos una pequeña tolerancia para la igualdad de volumen (evitar errores de punto flotante)
            const volumeTolerance = 0.00000001;
            // Solo compara si el monto total (size) no es cero (caso de órdenes de mercado USDT)
            const isFullyFilledByVolume = amountTotal > 0 && Math.abs(filledVolume - amountTotal) < volumeTolerance;

            // Criterio de Consolidación (la orden ha terminado Y tiene llenado O se llenó al 100%)
            const isConsolidationReady = (
                currentOrderState === 'filled' ||
                currentOrderState === 'partially_canceled' ||
                (currentOrderState === 'canceled' && filledVolume > 0) ||
                isFullyFilledByVolume // 👈 CRITERIO DE RESPALDO DE VOLUMEN
            );
            
            if (!isConsolidationReady) {
                // ⏸️ Orden activa, regresamos en el próximo ciclo (solo si el estado no es final)
                const isStillActive = currentOrderState === 'new' || currentOrderState === 'partially_filled';

                if (isStillActive) {
                    log(`La orden ID ${orderIdString} sigue activa (${currentOrderState}). Esperando...`, 'info');
                    return;
                }
            } 
            
            // ❌ Orden fallida/cancelada sin ejecución (filledVolume=0)
            if (filledVolume === 0) {
                log(`Orden ID ${orderIdString} falló/cancelada sin volumen. Reintegrando balance.`, 'error');
                
                const amountDeducted = parseNumber(lastOrder.usdt_amount || 0);
                currentLBalance += amountDeducted; // Reintegramos el USDT deducido.
                await updateGeneralBotState({ lbalance: currentLBalance, 'lStateData.lastOrder': null });
                log(`Reintegro de ${amountDeducted.toFixed(2)} USDT.`, 'info');
                return; 
            }


            // ======================================================
            // === LÓGICA DE CONSOLIDACIÓN DE POSICIÓN (ÉXITO: isConsolidationReady) ===
            // ======================================================
            if (isConsolidationReady) {
                const averagePrice = parseNumber(finalDetails.priceAvg || finalDetails.price || 0);
                const oldAc = parseNumber(lStateData.ac || 0);
                const oldPpc = parseNumber(lStateData.ppc || 0);
                
                // 1. Calcular el nuevo PPC (Precio Promedio de Compra)
                const totalSpentOld = oldAc * oldPpc;
                const totalSpentNew = filledVolume * averagePrice; 
                const newAc = oldAc + filledVolume;
                let newPpc = (newAc > 0) ? (totalSpentOld + totalSpentNew) / newAc : 0;
                
                // 2. Reintegrar USDT no usado (Market Slippage)
                const totalUsdtUsed = parseNumber(finalDetails.executedValue || finalDetails.executed_value || finalDetails.filledNotional || totalSpentNew);
                const amountDeducted = parseNumber(lastOrder.usdt_amount || 0);
                currentLBalance += (amountDeducted - totalUsdtUsed); 

                // 3. 🎯 ACTUALIZACIÓN ATÓMICA DE DATOS
                const atomicUpdate = {
                    lbalance: currentLBalance,
                    'lStateData.ppc': newPpc,
                    'lStateData.ac': newAc,
                    'lStateData.orderCountInCycle': (lStateData.orderCountInCycle || 0) + 1,
                    'lStateData.lastOrder': null // Limpiamos la orden.
                };

                await updateGeneralBotState(atomicUpdate);
                // Forzar la recarga del estado local para la Sección 2.
                const updatedBotState = await getBotState();
                lStateData = updatedBotState.lStateData; 
                currentLBalance = updatedBotState.lbalance;

                log(`[LONG] Compra confirmada. Nuevo PPC: ${newPpc.toFixed(2)}, AC: ${newAc.toFixed(8)}. Balance reintegrado.`, 'success');
                // No retornamos, continuamos a la Sección 2 para calcular targets inmediatamente.
            }

        } catch (error) {
            log(`Error de API/DB en el monitoreo: ${error.message}. Persistiendo y reintentando.`, 'error');
            return; 
        }
    }
    
    // El resto de las secciones (2 y 3) no necesitan cambios:

    // =================================================================
    // === [ 2. CÁLCULO Y GESTIÓN DE TARGETS ] ===========================
    // =================================================================
    if (!lStateData.lastOrder && lStateData.ppc > 0) { 
        log("Recalculando targets (Venta/Cobertura) y Límite de Cobertura...", 'info');
        
        const { 
            targetSellPrice, nextCoveragePrice, requiredCoverageAmount, 
            lCoveragePrice, lNOrderMax 
        } = calculateLongTargets(
            parseNumber(lStateData.ppc), 
            config.long.profit_percent, 
            config.long.price_var, 
            config.long.size_var,
            config.long.purchaseUsdt,
            parseNumber(lStateData.orderCountInCycle),
            currentLBalance
        );

        // 🎯 ACTUALIZACIÓN ATÓMICA DE TARGETS
        const targetsUpdate = {
            ltprice: targetSellPrice,
            lcoverage: lCoveragePrice, 
            lnorder: lNOrderMax,
            'lStateData.requiredCoverageAmount': requiredCoverageAmount,
            'lStateData.nextCoveragePrice': nextCoveragePrice,
        };

        await updateGeneralBotState(targetsUpdate);

        // Actualizamos el estado local para la Sección 3
        botState.ltprice = targetSellPrice; 
        lStateData.requiredCoverageAmount = requiredCoverageAmount; 
        lStateData.nextCoveragePrice = nextCoveragePrice;
        
        const logSummary = `
        💰 PPC: ${lStateData.ppc.toFixed(2)} USD | 🎯 TP: ${targetSellPrice.toFixed(2)} USD.
        📉 Proxima Cobertura: ${nextCoveragePrice.toFixed(2)} USD (Monto: ${requiredCoverageAmount.toFixed(2)} USDT).
        🛡️ Cobertura Máxima (L-Coverage): ${lCoveragePrice.toFixed(2)} USD (Órdenes restantes: ${lNOrderMax}).
    `.replace(/\s+/g, ' ').trim();
        log(logSummary, 'warning'); 
    }


    // =================================================================
    // === [ 3. EVALUACIÓN DE TRANSICIÓN DE ESTADO/COLOCACIÓN DE ORDEN ] =
    // =================================================================
    
    // 3A. Transición a SELLING por Take Profit (ltprice alcanzado)
    if (botState.ltprice > 0 && currentPrice >= botState.ltprice) {
        log(`[LONG] ¡TARGET DE VENTA (Take Profit) alcanzado! Transicionando a SELLING.`, 'success');
        await updateBotState('SELLING', 'long');
        return;
    }

    // 3B. Colocación de ORDEN de COBERTURA (DCA)
    const requiredAmount = parseNumber(lStateData.requiredCoverageAmount);
    
    if (!lStateData.lastOrder && lStateData.nextCoveragePrice > 0 && currentPrice <= lStateData.nextCoveragePrice) {
        
        if (requiredAmount <= 0) {
            log(`Error: Monto requerido para cobertura es cero. Transicionando a NO_COVERAGE.`, 'error');
            await updateBotState('NO_COVERAGE', 'long'); 
            return; 
        }

        if (currentLBalance >= requiredAmount) { 
            log(`[LONG] ¡Precio de COBERTURA alcanzado! Colocando orden de compra por ${requiredAmount.toFixed(2)} USDT.`, 'warning');
            
            // Colocar la nueva orden de compra a precio de mercado.
            await placeCoverageBuyOrder(botState, creds, requiredAmount, log, updateBotState, updateGeneralBotState);
            return;

        } else {
            log(`Advertencia: Precio de cobertura alcanzado, pero capital insuficiente. Transicionando a NO_COVERAGE.`, 'error');
            await updateBotState('NO_COVERAGE', 'long');
            return;
        }
    }
    
    // 3C. Lógica de inicio de Bot (PPC=0 y sin orden pendiente)
    if (lStateData.ppc === 0 && !lStateData.lastOrder) {
        const purchaseAmount = parseNumber(config.long.purchaseUsdt);
        
        if (currentLBalance >= purchaseAmount) {
            log("Posición inicial (AC=0). Intentando colocar la PRIMERA orden de compra...", 'info');
            await placeFirstBuyOrder(config, creds, log, botState, updateBotState, updateGeneralBotState);
            return;
        } else {
            log(`Posición inicial (AC=0). Balance insuficiente. Transicionando a NO_COVERAGE.`, 'info');
            await updateBotState('NO_COVERAGE', 'long');
            return;
        }
    }
}

module.exports = { run };