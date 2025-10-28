// BSB/server/src/states/long/LBuying.js

const { getOrderDetail } = require('../../../services/bitmartService');
const { 
    calculateLongTargets 
} = require('../../utils/dataManager'); // Importamos la función directamente

/**
 * Función central de la estrategia Long en estado BUYING.
 * Gestiona: 1. La recuperación/confirmación de órdenes de compra pendientes. 
 * 2. La consolidación de la posición (ppc/ac).
 * 3. El cálculo y establecimiento de targets (ltprice, nextCoveragePrice).
 */
async function run(dependencies) {
    const {
        botState, currentPrice, config, log, creds,
        updateBotState, updateLStateData, updateGeneralBotState,
        getBotState // Necesario para la auditoría 3/3
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const lStateData = botState.lStateData;

    log("Estado Long: BUYING. Verificando el estado de la última orden de compra o gestionando targets...", 'info');

    // =================================================================
    // === [ 1. MONITOREO DE ORDEN DE COMPRA PENDIENTE ] =================
    // =================================================================
    const lastOrder = lStateData.lastOrder;

    if (lastOrder && lastOrder.order_id && lastOrder.side === 'buy') {
        const orderIdString = String(lastOrder.order_id);
        log(`Recuperación: Orden de compra pendiente con ID ${orderIdString} detectada en DB. Consultando BitMart...`, 'warning');

        try {
            const orderDetails = await getOrderDetail(SYMBOL, orderIdString);
            
            // Si la orden se llenó o fue cancelada con ejecución parcial, la procesamos.
            const filledVolume = parseFloat(orderDetails?.filledVolume || 0); // Usar filledVolume en lugar de filled_volume (Ajuste para BitMart API)
            const isOrderProcessed = orderDetails && (
                orderDetails.state === 'filled' || 
                orderDetails.state === 'partially_canceled' || 
                (orderDetails.state === 'canceled' && filledVolume > 0)
            );

            if (isOrderProcessed) {
                const averagePrice = parseFloat(orderDetails.price_avg || orderDetails.price || 0);
                
                // Si filledVolume es 0 (aunque la bandera diga true, puede ser un error), no hay nada que procesar.
                if (filledVolume === 0) {
                    log(`Error: Orden ID ${orderIdString} cancelada o no ejecutada (Volumen 0). Limpiando lastOrder.`, 'error');
                    await updateLStateData({ 'lastOrder': null });
                    // Revertir a RUNNING para reintentar la compra inicial.
                    await updateBotState('RUNNING', 'long');
                    return;
                }

                log(`Recuperación exitosa: La orden ID ${orderIdString} se completó (Estado: ${orderDetails.state}). Procesando...`, 'success');

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
                
                // 2. Calcular el nuevo Balance y Total Gastado (para auditoría)
                const totalUsdtUsed = parseFloat(orderDetails.executed_value || 0);
                const newLBalance = (botState.lbalance || 0) + (lastOrder.usdt_amount - totalUsdtUsed); // Reintegramos el USDT no usado
                
                log(`[AUDITORÍA 1/3] -> ANTES de guardar. PPC a guardar: ${newPpc.toFixed(2)}, AC a guardar: ${newAc.toFixed(8)}, LState: BUYING`, 'debug');

                // 3. 🎯 CREACIÓN DE LA ACTUALIZACIÓN ATÓMICA DE DATOS
                const atomicUpdate = {
                    // Actualización del estado general
                    lbalance: newLBalance,
                    lnorder: (botState.lnorder || 0) + 1,
                    
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

                log(`[LONG] Orden de COMPRA confirmada. Nuevo PPC: ${newPpc.toFixed(2)}, Qty Total (AC): ${newAc.toFixed(8)}. Precio de ejecución: ${averagePrice.toFixed(2)}. Transicionando a BUYING.`, 'success');

            } else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                // ⏸️ Orden activa/parcialmente ejecutada. Persistir.
                log(`La orden ID ${orderIdString} sigue activa (${orderDetails.state}). Esperando ejecución.`, 'info');
                return;
            } else if (!orderDetails || (orderDetails && orderDetails.state === 'unknown')) {
                // 🤷 Orden no encontrada/desconocida (error de asincronía). Persistir.
                log(`ADVERTENCIA: La orden ID ${orderIdString} no se puede consultar o tiene estado desconocido. Se mantiene pendiente para reintento.`, 'warning');
                return; 
            } else {
                // ❌ Otros estados de error final (canceled, failed, expired) SIN NINGUNA ejecución. Limpiamos.
                log(`La orden ID ${orderIdString} tuvo un estado de error final sin ejecución. Limpiando lastOrder. Estado BitMart: ${orderDetails.state}`, 'error');
                await updateLStateData({ 'lastOrder': null });
                // Revertir a RUNNING para reintentar la compra inicial.
                await updateBotState('RUNNING', 'long'); 
                return;
            }

        } catch (error) {
            log(`Error al consultar orden en BitMart durante el monitoreo de COMPRA: ${error.message}. Persistiendo y reintentando en el próximo ciclo...`, 'error');
            return;
        }
    }
    
    // Si la última orden de compra ya se procesó (lastOrder es null), procedemos a calcular los targets.
    
    // =================================================================
    // === [ 2. GESTIÓN DE TARGETS DE VENTA Y COBERTURA ] ================
    // =================================================================
    if (!lStateData.lastOrder && lStateData.ppc > 0) { // Añadimos check de PPC > 0
        log("Calculando objetivos iniciales (Venta/Cobertura) para la nueva posición...", 'info');
        
        // Uso de calculateLongTargets
        const { targetSellPrice, nextCoveragePrice, requiredCoverageAmount } = calculateLongTargets(
            lStateData.ppc, 
            config.long.profit_percent, 
            config.long.price_var, 
            config.long.size_var,
            config.long.purchaseUsdt,
            lStateData.orderCountInCycle
        );

        log(`Targets Iniciales establecidos. Venta (ltprice): ${targetSellPrice.toFixed(2)}, Próxima Cobertura: ${nextCoveragePrice.toFixed(2)} (${requiredCoverageAmount.toFixed(2)} USDT)`, 'info');

        // 🎯 ACTUALIZACIÓN ATÓMICA DE TARGETS
        const targetsUpdate = {
            // Campos de nivel superior
            ltprice: targetSellPrice,
            lcoverage: requiredCoverageAmount, 
            
            // Campos de lStateData
            'lStateData.requiredCoverageAmount': requiredCoverageAmount,
            'lStateData.nextCoveragePrice': nextCoveragePrice,
        };

        await updateGeneralBotState(targetsUpdate);

        // 🚨 CRÍTICO: NO se coloca orden de VENTA LÍMITE aquí.
    }

    // =================================================================
    // === [ 3. EVALUACIÓN DE TRANSICIÓN DE ESTADO ] =====================
    // =================================================================
    
    // 3A. Transición a SELLING por Take Profit (ltprice alcanzado)
    if (botState.ltprice > 0 && currentPrice >= botState.ltprice) {
        log(`[LONG] ¡TARGET DE VENTA (Take Profit) alcanzado! Precio actual: ${currentPrice.toFixed(2)} >= ${botState.ltprice.toFixed(2)}. Transicionando a SELLING.`, 'success');
        
        // La lógica de venta y Trailing Stop se inicia en LSelling.
        await updateBotState('SELLING', 'long');
        return;
    }

    // 3B. Transición a BUYING (nueva compra de cobertura)
    if (lStateData.nextCoveragePrice > 0 && currentPrice <= lStateData.nextCoveragePrice) {
        // Si estamos por colocar una orden, la orden anterior (si existía) ya fue procesada.
        if (botState.lbalance >= lStateData.requiredCoverageAmount) {
            log(`[LONG] ¡Precio de COBERTURA alcanzado! Precio actual: ${currentPrice.toFixed(2)} <= ${lStateData.nextCoveragePrice.toFixed(2)}. Colocando orden de compra.`, 'warning');
            
            // 2. Colocar la nueva orden de compra a precio de mercado.
            const { placeCoverageBuyOrder } = require('../../utils/orderManager'); // Usamos la función de cobertura

            try {
                const amountUsdt = lStateData.requiredCoverageAmount; 
                // Esta función coloca la orden y actualiza la DB con lastOrder y lbalance.
                await placeCoverageBuyOrder(botState, amountUsdt, lStateData.nextCoveragePrice, log, updateGeneralBotState);
                // El estado ya es BUYING, solo esperamos la confirmación en el siguiente ciclo.
                
            } catch (error) {
                log(`Error CRÍTICO al colocar la orden de COBERTURA: ${error.message}.`, 'error');
            }
            return;
        } else {
            log(`Advertencia: Precio de cobertura alcanzado (${lStateData.nextCoveragePrice.toFixed(2)}), pero no hay suficiente capital disponible (${botState.lbalance.toFixed(2)} USDT). Manteniendo posición y esperando.`, 'error');
        }
    }

    // 3C. Sin transiciones (permanecer en BUYING)
    log(`Monitoreando... Venta: ${botState.ltprice.toFixed(2)}, Cobertura: ${lStateData.nextCoveragePrice.toFixed(2)}.`, 'debug');
}

module.exports = { run };