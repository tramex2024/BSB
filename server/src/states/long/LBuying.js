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
        updateBotState, updateGeneralBotState, getBotState, // Usamos updateGeneralBotState para todas las actualizaciones
        creds // Asumimos que creds está en las dependencias para getRecentOrders
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
//        log(`Recuperación: Orden pendiente ID ${orderIdString} detectada. Consultando BitMart...`, 'warning');
        // 🚨 NUEVO LOG: Muestra el ID y el estado interno
        log(`[DIAGNÓSTICO CRÍTICO] Verificando ID: ${orderIdString}. Estado interno: ${lastOrder.state || 'N/A'}`, 'error');
        log(`Recuperación: Orden pendiente ID ${orderIdString} detectada. Consultando BitMart...`, 'warning');
        try {
            let finalDetails = null;
            let filledVolume = 0;
            let isOrderProcessed = false;
            let logSource = 'Directa'; // Para saber de dónde obtuvimos los datos

            // 1. Intentar la consulta directa por ID
            try {
                let orderDetails = await getOrderDetail(SYMBOL, orderIdString);
                finalDetails = orderDetails;
                filledVolume = parseNumber(finalDetails?.filledVolume || finalDetails?.filledSize || 0); 
            } catch (e) {
                log(`Consulta Directa falló. Motivo: ${e.message}. Forzando respaldo.`, 'warning');
            }
            
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
            // 💡 LÓGICA DE RESPALDO (Historial)
            // ======================================================
            if (!isOrderProcessed) {
                log('No se pudo confirmar. Buscando en el historial de BitMart...', 'warning');
                logSource = 'Historial';
                
                const recentOrders = await getRecentOrders(creds, SYMBOL); 
                const orderInHistory = recentOrders.find(order => String(order.orderId) === orderIdString || String(order.order_id) === orderIdString);
                
                if (orderInHistory) {
                    finalDetails = orderInHistory;
                    filledVolume = parseNumber(finalDetails.filledVolume || finalDetails.filledSize || finalDetails.executed_volume || 0);
                    isOrderProcessed = filledVolume > 0;
                }
            }

            // 📢 ¡NUEVO LOG DE DIAGNÓSTICO CRÍTICO!
            log('----------------------------------------------------', 'debug');
            log(`[DIAGNÓSTICO] Fuente: ${logSource}`, 'debug');
            log(`[DIAGNÓSTICO] Estado API: ${finalDetails?.state || 'NO ENCONTRADO/NULO'}`, 'debug');
            log(`[DIAGNÓSTICO] Volumen Llenado (filledVolume): ${filledVolume}`, 'debug');
            log(`[DIAGNÓSTICO] ¿Consolidar (isOrderProcessed)? ${isOrderProcessed}`, 'debug');
            log(`[DIAGNÓSTICO] Order ID Verificado: ${orderIdString}`, 'debug');
            log('----------------------------------------------------', 'debug');



            // 3. EVALUACIÓN FINAL Y CONSOLIDACIÓN
            if (isOrderProcessed) {
                log(`Recuperación exitosa: La orden ID ${orderIdString} se completó. Procesando consolidación...`, 'success');

                // Aseguramos que el volumen sea positivo antes de consolidar.
                if (filledVolume === 0) {
                    // Esto no debería ocurrir si isOrderProcessed es true, pero es una protección final.
                    log(`Advertencia: Volumen llenado es cero a pesar de la bandera. Limpiando.`, 'error');
                    await updateGeneralBotState({ 'lStateData.lastOrder': null });
                    return;
                }
                
                // LÓGICA DE CONSOLIDACIÓN
                const averagePrice = parseNumber(finalDetails.priceAvg || finalDetails.price || 0);
                const oldAc = parseNumber(lStateData.ac || 0);
                const oldPpc = parseNumber(lStateData.ppc || 0);
                
                // 1. Calcular el nuevo PPC (Precio Promedio de Compra)
                const totalSpentOld = oldAc * oldPpc;
                const totalSpentNew = filledVolume * averagePrice;
                const newAc = oldAc + filledVolume;
                let newPpc = (newAc > 0) ? (totalSpentOld + totalSpentNew) / newAc : 0;
                
                // 2. Reintegrar USDT no usado
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
                
                log(`[LONG] Orden de COMPRA confirmada. Nuevo PPC: ${newPpc.toFixed(2)}, AC: ${newAc.toFixed(8)}. Balance reintegrado. Transicionando a RUNNING.`, 'success');
                
                // 🎯 Transición inmediata a RUNNING (como en tu código antiguo)
                await updateBotState('RUNNING', 'long'); 
                return; // Salir después de consolidar una orden.
            } 
            
            // 4. Espera o Fallo sin Ejecución
            
            // Si la orden sigue activa, esperamos.
            if (finalDetails && (finalDetails.state === 'new' || finalDetails.state === 'partially_filled')) {
                // ⏸️ Orden activa/parcialmente ejecutada. Persistir.
                log(`La orden ID ${orderIdString} sigue activa (${finalDetails.state}). Esperando ejecución.`, 'info');
                return;
            } 
            
            // Si llegamos aquí, la orden no se procesó Y no está activa (fue cancelada sin llenado, etc.).
            if (finalDetails && filledVolume === 0) {
                 log(`❌ Orden ID ${orderIdString} cancelada o no ejecutada (Volumen 0). Limpiando lastOrder. Reintegrando balance deducido.`, 'error');
                 const amountDeducted = parseNumber(lastOrder.usdt_amount || 0);
                 currentLBalance += amountDeducted; // Reintegramos el total.
                 await updateGeneralBotState({ lbalance: currentLBalance, 'lStateData.lastOrder': null });
                 await updateBotState('RUNNING', 'long'); // Transicionar para reevaluar.
                 return;
            }


        } catch (error) {
            log(`Error CRÍTICO de API en el monitoreo: ${error.message}. Persistiendo y reintentando.`, 'error');
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