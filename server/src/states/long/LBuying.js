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
            // 🛑 CORRECCIÓN 2 FINALIZADA: Solo se envían SYMBOL y orderIdString.
            const orderDetails = await getOrderDetail(SYMBOL, orderIdString);
            
            // Si la orden se llenó o fue cancelada con ejecución parcial, la procesamos.
            const isOrderProcessed = orderDetails && (
                orderDetails.state === 'filled' || 
                orderDetails.state === 'partially_canceled' || 
                (orderDetails.state === 'canceled' && parseFloat(orderDetails.filled_volume || 0) > 0)
            );

            if (isOrderProcessed) {
                const filledVolume = parseFloat(orderDetails.filled_volume || 0);
                const averagePrice = parseFloat(orderDetails.price_avg || orderDetails.price || 0);
                
                // Si filledVolume es 0, no hay nada que procesar (error o cancelación total).
                if (filledVolume === 0) {
                     log(`Error: Orden ID ${orderIdString} cancelada o no ejecutada. Limpiando lastOrder para reintentar.`, 'error');
                     await updateLStateData({ 'lastOrder': null });
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
                const newLBalance = (botState.lbalance || 0) - totalUsdtUsed;

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
                    'lStateData.lastOrder': null // Limpiamos la orden de COMPRA, ya se procesó.
                };

                // 4. Aplicar la actualización atómica
                await updateGeneralBotState(atomicUpdate);
                
                log(`[AUDITORÍA 2/3] -> DESPUÉS de guardar (Objeto en memoria). PPC: ${newPpc.toFixed(2)}, AC: ${newAc.toFixed(8)}, LState: BUYING`, 'debug');

                // 5. Verificación (Opcional, pero útil para depuración)
                // Se verifica la existencia de getBotState antes de llamarla
                if (getBotState) {
                    const updatedBotState = await getBotState();
                    log(`[AUDITORÍA 3/3] -> VERIFICACIÓN EN DB. PPC leído: ${updatedBotState.lStateData.ppc.toFixed(2)}, AC leído: ${updatedBotState.lStateData.ac.toFixed(8)}, LState: ${updatedBotState.lstate}`, 'debug');
                } else {
                     log(`[AUDITORÍA 3/3] -> VERIFICACIÓN OMITIDA. getBotState no está disponible en las dependencias.`, 'debug');
                }

                log(`[LONG] Orden de COMPRA confirmada. Nuevo PPC: ${newPpc.toFixed(2)}, Qty Total (AC): ${newAc.toFixed(8)}. Precio de ejecución: ${averagePrice.toFixed(2)}. Transicionando a BUYING.`, 'success');

            } else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                // La orden sigue activa o parcialmente ejecutada. Esperar.
                log(`La orden ID ${orderIdString} sigue activa (${orderDetails.state}). Esperando ejecución.`, 'info');
                return;
            } else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                // La orden sigue activa o parcialmente ejecutada. Esperar.
                log(`La orden ID ${orderIdString} sigue activa (${orderDetails.state}). Esperando ejecución.`, 'info');
                return;
            } else {
                // =========================================================
                // 🛠️ BLOQUE DE MONITOREO CORREGIDO 🛠️
                // Esto detiene la limpieza inmediata de 'lastOrder' si BitMart es lento.
                // =========================================================
                if (orderDetails && orderDetails.state === 'canceled' && parseFloat(orderDetails.filled_volume || 0) === 0) {
                    log(`La orden ID ${orderIdString} fue CANCELADA sin ejecución. Limpiando lastOrder. Estado BitMart: ${orderDetails.state}`, 'error');
                    await updateLStateData({ 'lastOrder': null });
                } else if (!orderDetails || (orderDetails && orderDetails.state === 'unknown')) {
                    // Si no encontramos detalles (el error 'No Encontrada' del log), damos tiempo.
                    log(`ADVERTENCIA CRÍTICA: La orden ID ${orderIdString} no se puede consultar. Reintentando en el próximo ciclo. NO se limpia lastOrder.`, 'error');
                    // Simplemente salimos de la función (return implícito)
                } else {
                    // Manejo de otros estados de error o no completados (e.g., failed, expired)
                    log(`La orden ID ${orderIdString} tuvo un estado de error no procesable. Limpiando lastOrder para reintentar. Estado BitMart: ${orderDetails.state}`, 'error');
                    await updateLStateData({ 'lastOrder': null });
                }
                return;
                // =========================================================
                // ⬆️ FIN DEL BLOQUE CORREGIDO ⬆️
                // =========================================================
            }

        } catch (error) {
            log(`Error al consultar orden en BitMart durante el monitoreo de COMPRA: ${error.message}. Reintentando...`, 'error');
            return;
        }
    }
    
    // Si la última orden de compra ya se procesó (lastOrder es null), procedemos a calcular los targets.
    
    // =================================================================
    // === [ 2. GESTIÓN DE TARGETS DE VENTA Y COBERTURA ] ================
    // =================================================================
    if (!lStateData.lastOrder) {
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
            // NO se guarda pm ni pc aquí.
        };

        await updateGeneralBotState(targetsUpdate);

        // 🚨 CRÍTICO: NO se coloca orden de VENTA LÍMITE aquí. La venta se gestiona íntegramente en LSelling.
        // La variable lastOrder debe permanecer null en este punto.
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
        // Debemos asegurarnos de que el balance aún permita la compra.
        if (botState.lbalance >= lStateData.requiredCoverageAmount) {
             log(`[LONG] ¡Precio de COBERTURA alcanzado! Precio actual: ${currentPrice.toFixed(2)} <= ${lStateData.nextCoveragePrice.toFixed(2)}. Colocando orden de compra.`, 'warning');
            
            // 🚨 CRÍTICO: NO hay cancelación de orden de VENTA LÍMITE aquí.
            
            // 2. Colocar la nueva orden de compra a precio de mercado.
            const { placeMarketBuyOrder } = require('../../utils/orderManager');

            try {
                // Monto en USDT para la compra de cobertura
                const amountUsdt = lStateData.requiredCoverageAmount; 
                const newOrder = await placeMarketBuyOrder(SYMBOL, amountUsdt, log);
                
                // Guardar la orden de compra para monitoreo.
                 const newLastOrder = {
                    order_id: newOrder.order_id,
                    side: 'buy',
                    amount: amountUsdt, 
                    price: currentPrice // Precio de referencia
                };
                
                await updateLStateData({ 'lastOrder': newLastOrder });
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