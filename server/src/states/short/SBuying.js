// BSB/server/src/states/short/SBuying.js
// Lógica de ENTRADA INICIAL (Venta) y COBERTURA (Compra DCA)

const { getOrderDetail, getRecentOrders } = require('../../../services/bitmartService'); 
const { 
    calculateShortTargets 
} = require('../../../autobotShortCalculations');
// NOTA: placeInitialSellOrder usa BTC para la venta inicial (lado short)
// NOTA: placeCoverageBuyOrder usa USDT para la compra de cobertura (lado short)
const { placeInitialSellOrder, placeCoverageBuyOrder } = require('../managers/shortOrderManager'); 

const SSTATE = 'short';

/**
 * Función central de la estrategia Short en estado BUYING (Entrada/Cobertura).
 * Gestiona: 1. La recuperación/confirmación de órdenes pendientes (Venta inicial o Compra de Cobertura).
 * 2. La consolidación de la posición (ppc/ac).
 * 3. El cálculo y establecimiento de targets (stprice, nextCoveragePrice).
 */
async function run(dependencies) {
    const {
        botState, currentPrice, config, log,
        updateBotState, updateSStateData, updateGeneralBotState,
        // getBotState // Eliminado si ya cargamos botState al inicio del ciclo principal
    } = dependencies;

    const SYMBOL = String(config.symbol || 'BTC_USDT');
    const sStateData = botState.sStateData;
    const { sellBtc, profit_percent, price_var, size_var } = config.short;

    log("Estado Short: BUYING. Verificando el estado de la última orden (Venta o Compra de Cobertura) o gestionando targets...", 'info');

    // =================================================================
    // === [ 1. MONITOREO DE ORDEN PENDIENTE ] ===========================
    // =================================================================
    const lastOrder = sStateData.lastOrder;

    if (lastOrder && lastOrder.order_id) {
        const orderIdString = String(lastOrder.order_id);
        const side = lastOrder.side; // 'sell' para entrada, 'buy' para cobertura
        
        log(`Recuperación: Orden ${side} pendiente con ID ${orderIdString} detectada en DB. Consultando BitMart...`, 'warning');

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
            // 💡 LÓGICA DE RESPALDO
            // ======================================================
            if (!isOrderProcessed) {
                log(`Fallo/inconcluso en consulta directa. Buscando orden ${orderIdString} en el historial de BitMart...`, 'warning');
                
                // 2. Buscar en el historial
                const recentOrders = await getRecentOrders(SYMBOL); 
                finalDetails = recentOrders.find(order => order.orderId === orderIdString || order.order_id === orderIdString);
                
                if (finalDetails) {
                    filledVolume = parseFloat(finalDetails.filledVolume || finalDetails.filledSize || 0);
                    isOrderProcessed = filledVolume > 0;
                    
                    if (isOrderProcessed) {
                        log(`Orden ${orderIdString} encontrada y confirmada como llenada en el historial (Volumen llenado: ${filledVolume}).`, 'success');
                    }
                }
            }

            if (isOrderProcessed) {
                const averagePrice = parseFloat(finalDetails.priceAvg || finalDetails.price || 0);
                
                if (filledVolume === 0) {
                    log(`Error: Orden ID ${orderIdString} cancelada o no ejecutada (Volumen 0). Limpiando lastOrder.`, 'error');
                    await updateSStateData({ 'lastOrder': null });
                    await updateBotState('RUNNING', SSTATE);
                    return;
                }

                log(`Recuperación exitosa: La orden ID ${orderIdString} se completó. Procesando consolidación...`, 'success');

                // === LÓGICA DE CONSOLIDACIÓN DE POSICIÓN (CRÍTICA) ===
                const oldAc = sStateData.ac || 0;
                const oldPpc = sStateData.ppc || 0;
                
                let newAc, newPpc, newSBalance;

                if (side === 'sell') {
                    // **ENTRADA INICIAL EN SHORT (Venta)**: Aumenta la cantidad Short.
                    newAc = oldAc + filledVolume;
                    
                    // Cálculo del nuevo PPC (Precio Promedio de Venta)
                    if (newAc > 0) {
                        // (Posición Vieja * Precio Viejo + Posición Nueva * Precio Nuevo) / Nueva Posición
                        newPpc = ((oldAc * oldPpc) + (filledVolume * averagePrice)) / newAc;
                    } else {
                        newPpc = averagePrice;
                    }
                    
                    // El balance Short (sbalance, en BTC) disminuye al vender (se usa el BTC para la venta).
                    newSBalance = (botState.sbalance || 0) - filledVolume; 

                    log(`[SHORT] Venta Inicial (Entrada). Nuevo PPC: ${newPpc.toFixed(2)}, AC: ${newAc.toFixed(8)} BTC.`, 'debug');
                
                } else if (side === 'buy') {
                    // **✅ COBERTURA SHORT (Compra DCA - Recompra)**
                    
                    const totalBtcToCover = filledVolume; // Cantidad de BTC comprada (recompra)

                    // 1. CALCULAR NUEVA POSICIÓN NETA (AC)
                    // La posición Short NETA se REDUCE al recomprar.
                    newAc = oldAc - totalBtcToCover; 
                    
                    // 2. CALCULAR NUEVO PPC (Precio Promedio de Venta de lo que QUEDA)
                    if (newAc > 0) {
                        // Valor total USDT de la Venta original (posición short)
                        const initialSaleValueUsdt = oldAc * oldPpc;
                        // Costo de la Recompra 
                        const repurchaseCostUsdt = totalBtcToCover * averagePrice; 
                        
                        // El Capital Neto USDT restante de la posición abierta
                        const capitalNetoUsdt = initialSaleValueUsdt - repurchaseCostUsdt;
                        
                        // Nuevo PPC: Valor USDT restante / Cantidad BTC restante
                        newPpc = capitalNetoUsdt / newAc;

                    } else {
                        newPpc = 0;
                    }
                    
                    // 3. CALCULAR NUEVO SBalance
                    // El balance Short (sbalance, en BTC) AUMENTA al recomprar.
                    newSBalance = (botState.sbalance || 0) + totalBtcToCover; 
                    
                    log(`[SHORT] Cobertura (Compra DCA). Nuevo PPC: ${newPpc.toFixed(2)}, AC Neto: ${newAc.toFixed(8)} BTC.`, 'debug');

                    if (newAc <= 0) {
                        log('¡Advertencia! Posición Short completamente cubierta durante DCA. Cierre forzado del ciclo.', 'warning');
                        await updateBotState('RUNNING', SSTATE);
                    }

                } else {
                    log(`Error de Lógica: Orden ${side} inesperada en SBuying. Limpiando lastOrder.`, 'error');
                    await updateSStateData({ 'lastOrder': null });
                    await updateBotState('RUNNING', SSTATE);
                    return;
                }
                

                // 3. 🎯 CREACIÓN DE LA ACTUALIZACIÓN ATÓMICA DE DATOS
                // Recargamos el estado para asegurar la última versión de snorder/scycle
                const currentBotState = await Autobot.findOne({});
                
                const atomicUpdate = {
                    // Actualización del estado general
                    sbalance: newSBalance,
                    // snorder y scycle se manejan por la lógica de calculateShortTargets/calculateInitialState
                    // Mantendremos el orden de cobertura en el subdocumento
                    

                    // Actualización de SStateData
                    'sStateData.ppc': newPpc,
                    'sStateData.ac': newAc,
                    'sStateData.orderCountInCycle': (sStateData.orderCountInCycle || 0) + 1,
                    'sStateData.lastOrder': null // ✅ Limpiamos la orden
                };

                // 4. Aplicar la actualización atómica
                await updateGeneralBotState(atomicUpdate);

                // Transicionamos a RUNNING si la posición sigue abierta, para esperar el TP o la próxima cobertura.
                if (newAc > 0) {
                    await updateBotState('RUNNING', SSTATE); 
                } else {
                    // Si AC <= 0, la posición se cerró completamente. Limpiamos y volvemos a RUNNING para reinicio seguro.
                    await updateBotState('RUNNING', SSTATE);
                    // El estado RUNNING se encargará de detectar AC=0 y reiniciar los targets (TP/Cobertura).
                }
                return;

            } else if (finalDetails && (finalDetails.state === 'new' || finalDetails.state === 'partially_filled')) {
                log(`La orden ID ${orderIdString} sigue activa (${finalDetails.state}). Esperando ejecución.`, 'info');
                return;
            } else {
                log(`La orden ID ${orderIdString} tuvo un estado de error final sin ejecución. Limpiando lastOrder.`, 'error');
                await updateSStateData({ 'lastOrder': null });
                // Continuar la ejecución para colocar una nueva orden.
            }

        } catch (error) {
            log(`Error de API al consultar la orden ${orderIdString} o en lógica de respaldo: ${error.message}. Persistiendo y reintentando en el próximo ciclo...`, 'error');
            return;
        }
    }
    
    // =================================================================
    // === [ 2. GESTIÓN DE TARGETS Y COLOCACIÓN DE ORDEN ] ===============
    // =================================================================
    
    // Verificamos si la posición ya está abierta o si es la primera entrada.
    if (sStateData.ac === 0) {
        // A. ENTRADA INICIAL EN SHORT (Venta a Mercado)
        const entryAmount = parseFloat(sellBtc || 0);

        if (entryAmount > 0) {
            log(`Posición Short inactiva (AC=0). Colocando orden de VENTA inicial de ${entryAmount.toFixed(8)} BTC.`, 'info');
            
            // placeInitialSellOrder coloca la orden y actualiza lastOrder y sbalance.
            await placeInitialSellOrder(botState, entryAmount, log, updateGeneralBotState);
            // El estado sigue siendo BUYING, esperando la ejecución.
        } else {
            log('Error: Monto inicial de BTC para Short (sellBtc) es cero. Deteniendo estrategia Short.', 'error');
            await updateBotState('STOPPED', SSTATE);
        }
    } else if (!sStateData.lastOrder) {
        // B. GESTIÓN DE COBERTURA (DCA) - Posición abierta (AC > 0) y sin orden pendiente.

        // --- CÁLCULO DE TARGETS ---
        const { 
            targetBuyPrice: stprice, 
            nextCoveragePrice, 
            requiredCoverageAmount, // Cantidad de BTC requerida para la próxima compra de cobertura
            sCoveragePrice,      
            sNOrderMax           
        } = calculateShortTargets(
            sStateData.ppc, 
            profit_percent, 
            price_var, 
            size_var, 
            sellBtc,
            sStateData.orderCountInCycle,
            botState.sbalance // Balance operativo Short (en BTC)
        );

        // --- ACTUALIZACIÓN ATÓMICA DE TARGETS ---
        const targetsUpdate = {
            stprice: stprice,
            scoverage: sCoveragePrice,
            snorder: sNOrderMax,
            'sStateData.requiredCoverageAmount': requiredCoverageAmount,
            'sStateData.nextCoveragePrice': nextCoveragePrice,
        };
        await updateGeneralBotState(targetsUpdate);

        log(`[SHORT] Targets establecidos. TP Recompra: ${stprice.toFixed(2)}, Cobertura: ${nextCoveragePrice.toFixed(2)}.`, 'debug');
        log(`Límite de Cobertura (SCoverage): ${sCoveragePrice.toFixed(2)} USD (Órdenes restantes posibles: ${sNOrderMax}).`, 'warning');


        // --- VERIFICACIÓN DE CONDICIÓN DE COBERTURA ---
        if (currentPrice >= nextCoveragePrice) {
            
            if (sNOrderMax === 0) {
                // No hay balance, transicionar a estado de espera
                log(`¡Advertencia! Precio de cobertura alcanzado, pero no hay suficiente balance BTC para la orden requerida.`, 'error');
                await updateBotState('NO_COVERAGE', SSTATE);
                return;
            }

            // Colocar Orden de COMPRA (DCA)
            log(`Condición de Cobertura Short (DCA) alcanzada. Colocando orden de COMPRA de ${requiredCoverageAmount.toFixed(8)} BTC al límite ${nextCoveragePrice.toFixed(2)}.`, 'warning');
            
            // placeCoverageBuyOrder coloca la orden y actualiza lastOrder (y no toca sbalance en este punto)
            await placeCoverageBuyOrder(botState, requiredCoverageAmount, nextCoveragePrice, log, updateGeneralBotState);
            // El estado sigue siendo BUYING, esperando la ejecución.
        } else {
            // Precio no alcanza la cobertura, transicionamos a RUNNING (monitoreo)
            log("Precio actual no requiere cobertura Short. Transicionando a RUNNING.", 'info');
            await updateBotState('RUNNING', SSTATE);
        }
    }
}

module.exports = { run };