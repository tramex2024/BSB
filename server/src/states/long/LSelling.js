// BSB/server/src/states/long/LSelling.js (FINALIZADO)

const { parseNumber } = require('../../../utils/helpers'); 
const { placeSellOrder } = require('../../utils/orderManager');
const { getOrderDetail } = require('../../../services/bitmartService'); 

const MIN_SELL_AMOUNT_BTC = 0.00004;

const LSTATE = 'long'; 
// 💡 VALOR DEFINIDO POR EL USUARIO PARA EL TRAILING STOP (0.4%)
const TRAILING_STOP_PERCENTAGE = 0.4; 

// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL Y CIERRE DE CICLO
// =========================================================================

/**
 * Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateLStateData, updateGeneralBotState } = dependencies;
    
    try {
        // 1. CÁLCULO DE CAPITAL Y GANANCIA
        const { ac: totalBtcSold, ppc: oldPpc } = botStateObj.lStateData;
        
        const sellPrice = parseNumber(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseNumber(orderDetails.filled_volume || orderDetails.amount || totalBtcSold || 0);
        
        const totalUsdtRecovered = filledSize * sellPrice;
        const totalUsdtSpent = parseNumber(totalBtcSold) * parseNumber(oldPpc); 
        const profit = totalUsdtRecovered - totalUsdtSpent;
        
        // 2. RECUPERACIÓN DE CAPITAL OPERATIVO Y GANANCIA
        // newLBalance = Balance_Actual_Disponible + Capital_Gastado_en_la_Posición + Ganancia_Neta
        const newLBalance = parseNumber(botStateObj.lbalance) + totalUsdtSpent + profit;
        
        // --- 2a. UPDATE DE ESTADO GENERAL (Punto 1 de Persistencia) ---
        await updateGeneralBotState({
            lbalance: newLBalance,
            totalProfit: parseNumber(botStateObj.totalProfit || 0) + profit,
            
            // 🎯 RESETEO DE DATOS DE ESTADO GENERAL Y CONTADORES
            ltprice: 0, lcoverage: 0, lnorder: 0,
            lcycle: parseNumber(botStateObj.lcycle || 0) + 1 // ¡Incrementar el contador de ciclo!
        });

        log(`Cierre de Ciclo Long Exitoso! Ganancia: ${profit.toFixed(2)} USDT.`, 'success');
        log(`Capital operativo disponible: ${newLBalance.toFixed(2)} USDT.`, 'info');

        // 3. RESETEO DE DATOS DE CICLO ESPECÍFICOS (lStateData)
        const resetLStateData = {
            ac: 0, ppc: 0,
            orderCountInCycle: 0, 
            lastOrder: null, 
            pm: 0, pc: 0, pv: 0
        }
        // --- 3a. UPDATE DE LSTATEDATA (Punto 2 de Persistencia) ---
        await updateLStateData(resetLStateData);

        // 4. TRANSICIÓN DE ESTADO 
        if (config.long.stopAtCycle) {
            log('Configuración: stopAtCycle activado. Bot Long se detendrá.', 'info');
            await updateBotState('STOPPED', LSTATE);
        } else {
            log('Transicionando a BUYING para nueva compra.', 'info');
            await updateBotState('BUYING', LSTATE);
        }

    } catch (error) {
        log(`CRITICAL PERSISTENCE ERROR: Falló el reseteo del estado tras venta: ${error.message}`, 'error');
        try {
            await updateLStateData({ 'lastOrder': null });
        } catch (dbError) {
            log(`FALLA DE RECUPERACIÓN: No se pudo limpiar lastOrder. Revise DB.`, 'error');
        }
    }
}

// =========================================================================
// FUNCIÓN PRINCIPAL DE GESTIÓN DEL ESTADO SELLING
// =========================================================================

async function run(dependencies) {
    const { botState, currentPrice, config, creds, log, updateLStateData } = dependencies;
    
    const lastOrder = botState.lStateData.lastOrder;
    const SYMBOL = config.symbol || 'BTC_USDT';
    
    // Inyectar dependencias necesarias para handleSuccessfulSell
    const handlerDependencies = { config, log, updateBotState: dependencies.updateBotState, updateLStateData, updateGeneralBotState: dependencies.updateGeneralBotState };

    // =================================================================
    // === [ 1. RECUPERACIÓN DE ORDEN DE VENTA PENDIENTE ] ================
    // =================================================================
    if (lastOrder && lastOrder.order_id && lastOrder.side === 'sell') {
        log(`Recuperación: Orden de venta ID ${lastOrder.order_id} pendiente. Consultando BitMart...`, 'warning');

        try {
            const orderDetails = await getOrderDetail(creds, SYMBOL, lastOrder.order_id); 
            const filledVolume = parseNumber(orderDetails.filled_volume || orderDetails.filledSize || 0);

            // La orden está "llena" si su estado es filled O si el volumen llenado coincide con el AC total.
            const isOrderFilled = orderDetails && (orderDetails.state === 'filled' || filledVolume === parseNumber(botState.lStateData.ac));

            if (isOrderFilled) {
                log(`Recuperación exitosa: La orden ID ${lastOrder.order_id} se completó. Procesando cierre de ciclo.`, 'success');
                await handleSuccessfulSell(botState, orderDetails, handlerDependencies); 
                return;

            } else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                log(`Recuperación: La orden ID ${lastOrder.order_id} sigue ${orderDetails.state}. Esperando ejecución.`, 'info');
                return;

            } else {
                log(`La orden ID ${lastOrder.order_id} no está activa ni completada. Limpiando y reintentando venta.`, 'error');
                await updateLStateData({ 'lastOrder': null });
                // Continuamos a la lógica de Trailing Stop para reintentar.
            }
        } catch (error) {
        // 🛑 MANEJO DEL ERROR 50005 🛑
        if (error.message.includes('50005')) {
            log(`Advertencia: Orden ${lastOrder.order_id} Error 50005 (Desaparecida). Asumiendo llenado forzado y cerrando ciclo.`, 'warning');
            
            await updateLStateData({ 'lastOrder': null }); 
            
            const assumedDetails = { 
                priceAvg: currentPrice, // Usamos el precio actual como proxy
                filled_volume: botState.lStateData.ac // Asumimos la cantidad total vendida
            };
            await handleSuccessfulSell(botState, assumedDetails, handlerDependencies); 
            
            return;
        }

            log(`Error de API al consultar orden: ${error.message}. Persistiendo y reintentando.`, 'error');
            return;
        }
    }
    // =================================================================
    // === [ 2. LÓGICA DE TRAILING STOP ] ===============================
    // =================================================================
    
    const { ac: acSelling, pm } = botState.lStateData;
    const currentPm = parseNumber(pm || 0);

    log("Estado Long: SELLING. Gestionando Trailing Stop...", 'info');
    
    // 1. CÁLCULO DEL TRAILING STOP
    const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100;
    const newPm = Math.max(currentPm, currentPrice);
    const newPc = newPm * (1 - trailingStopPercent);

    // 2. ACTUALIZACIÓN Y PERSISTENCIA DE DATOS (PM y PC)
    if (newPm > currentPm) {
        log(`Trailing Stop: PM actualizado a ${newPm.toFixed(2)}. PC actualizado a ${newPc.toFixed(2)} (${TRAILING_STOP_PERCENTAGE}% caída).`, 'info');
        await updateLStateData({ pm: newPm, pc: newPc });
    } else {
        log(`Monitoreando: Precio actual: ${currentPrice.toFixed(2)}, PM: ${newPm.toFixed(2)}, PC: ${newPc.toFixed(2)}`, 'info');
    }
    
    // 3. CONDICIÓN DE VENTA Y LIQUIDACIÓN
    if (acSelling >= MIN_SELL_AMOUNT_BTC && !lastOrder) {
        if (currentPrice <= newPc) {
            log(`Condiciones de venta por Trailing Stop alcanzadas. Colocando orden de venta para liquidar ${acSelling.toFixed(8)} BTC.`, 'success');
            
            // La orden manager se encarga de llamar a handleSuccessfulSell al completarse.
            await placeSellOrder(config, creds, acSelling, log, handleSuccessfulSell, botState, handlerDependencies);
        }
    } else if (acSelling > 0 && acSelling < MIN_SELL_AMOUNT_BTC) {
        log(`Advertencia: Cantidad para vender (${acSelling.toFixed(8)} BTC) es menor al mínimo (${MIN_SELL_AMOUNT_BTC} BTC). Venta bloqueada.`, 'warning');
    }       
}

module.exports = { 
    run, 
    handleSuccessfulSell
};