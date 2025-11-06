// BSB/server/src/states/long/LSelling.js (CORREGIDO: Total Profit y Validación USDT)

const { placeSellOrder } = require('../../utils/orderManager');
const { getOrderDetail } = require('../../../services/bitmartService'); 

// 🚨 ELIMINADO: const MIN_SELL_AMOUNT_BTC = 0.00005; (Usaremos MIN_SELL_USDT_EXCHANGE)
const MIN_SELL_USDT_EXCHANGE = 5.00; // Mínimo de venta asumido por BitMart en USDT
const LSTATE = 'long'; 
const TRAILING_STOP_PERCENTAGE = 0.4; 


// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL Y CIERRE DE CICLO
// =========================================================================

/**
 * Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    const { config, log, updateBotState, updateLStateData, updateGeneralBotState, creds } = dependencies;
    
    try {
        // 1. CÁLCULO DE CAPITAL Y GANANCIA
        const { ac: totalBtcSold, ppc } = botStateObj.lStateData;
        
        const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price || 0);
        const filledSize = parseFloat(orderDetails.filled_volume || orderDetails.amount || totalBtcSold || 0);
        
        const totalUsdtRecovered = filledSize * sellPrice;
        const totalUsdtSpent = totalBtcSold * ppc;
        const profit = totalUsdtRecovered - totalUsdtSpent;
        
        // 2. RECUPERACIÓN DE CAPITAL OPERATIVO Y GANANCIA
        const newLBalance = botStateObj.lbalance + totalUsdtRecovered;
        
        // --- 2a. UPDATE DE ESTADO GENERAL (Punto 1 de Persistencia) ---
        await updateGeneralBotState({
            lbalance: newLBalance,
            // ✅ CORRECCIÓN CRÍTICA: Usar botStateObj.total_profit (snake_case)
            totalProfit: (botStateObj.total_profit || 0) + profit, 
            
            // 🎯 RESETEO DE DATOS DE ESTADO GENERAL Y CONTADORES
            ltprice: 0,
            lcoverage: 0,
            lnorder: 0,
            lcycle: (botStateObj.lcycle || 0) + 1
        });

        log(`Cierre de Ciclo Long Exitoso! Ganancia: ${profit.toFixed(2)} USDT.`, 'success');
        log(`LBalance actualizado. Capital operativo disponible: ${newLBalance.toFixed(2)} USDT.`, 'info');

        // 3. RESETEO DE DATOS DE CICLO ESPECÍFICOS (lStateData)
        const resetLStateData = {
            ac: 0, ppc: 0,
            orderCountInCycle: 0, 
            lastOrder: null,
            pm: 0, pc: 0, pv: 0
        }
        // --- 3a. UPDATE DE LSTATEDATA (Punto 2 de Persistencia - CRÍTICO) ---
        await updateLStateData(resetLStateData);

        // 4. TRANSICIÓN DE ESTADO (Reinicia el ciclo de compra)
        if (config.long.stopAtCycle) {
            log('Configuración: stopAtCycle activado. Bot Long se detendrá.', 'info');
            await updateBotState('STOPPED', LSTATE);
        } else {
            log('Configuración: stopAtCycle desactivado. Transicionando a BUYING para iniciar la nueva compra.', 'info');
            await updateBotState('BUYING', LSTATE);
        }

    } catch (error) {
        // Lógica de recuperación autónoma
        log(`CRITICAL PERSISTENCE ERROR: Falló el reseteo del estado tras venta exitosa/asumida. Causa: ${error.message}`, 'error');
        try {
            await updateLStateData({ 'lastOrder': null });
        } catch (dbError) {
             log(`FALLA DE RECUPERACIÓN: No se pudo limpiar lastOrder. Revise la conexión/estado de la DB.`, 'error');
        }
    }
}

// =========================================================================
// FUNCIÓN PRINCIPAL DE GESTIÓN DEL ESTADO SELLING
// =========================================================================

async function run(dependencies) {
    const { botState, currentPrice, config, creds, log, updateLStateData, updateBotState, updateGeneralBotState } = dependencies;
    
    // ... (Bloque de recuperación de servidor se mantiene igual) ...

    const lastOrder = botState.lStateData.lastOrder;
    const SYMBOL = config.symbol || 'BTC_USDT';

    if (lastOrder && lastOrder.order_id && lastOrder.side === 'sell') {
        log(`Recuperación: Orden de venta pendiente con ID ${lastOrder.order_id} detectada en DB. Consultando BitMart...`, 'warning');

        try {
            const orderDetails = await getOrderDetail(SYMBOL, lastOrder.order_id);

            const isOrderFilled = orderDetails && (orderDetails.state === 'filled' || 
                (orderDetails.state === 'partially_canceled' && parseFloat(orderDetails.filled_volume || 0) > 0));

            if (isOrderFilled) {
                log(`Recuperación exitosa: La orden ID ${lastOrder.order_id} se completó durante el tiempo de inactividad.`, 'success');
                const handlerDependencies = { config, creds, log, updateBotState, updateLStateData, updateGeneralBotState };
                await handleSuccessfulSell(botState, orderDetails, handlerDependencies); 
                return;
            } else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                log(`Recuperación: La orden ID ${lastOrder.order_id} sigue ${orderDetails.state} en BitMart. Esperando ejecución.`, 'info');
                return;
            } else {
                log(`La orden ID ${lastOrder.order_id} no está activa ni completada. Asumiendo fallo y permitiendo una nueva venta. Estado: ${orderDetails ? orderDetails.state : 'No Encontrada'}`, 'error');
                await updateLStateData({ 'lastOrder': null });
            }
        } catch (error) {
            if (error.message.includes('50005')) {
                log(`Advertencia: Orden ${lastOrder.order_id} desapareció del historial reciente (Error 50005). Asumiendo llenado instantáneo y forzando cierre de ciclo.`, 'warning');
                await updateLStateData({ 'lastOrder': null }); 
                const handlerDependencies = { config, creds, log, updateBotState, updateLStateData, updateGeneralBotState };
                await handleSuccessfulSell(botState, { priceAvg: 0, filled_volume: botState.lStateData.ac }, handlerDependencies); 
                return;
            }
            log(`Error al consultar orden en BitMart durante la recuperación: ${error.message}`, 'error');
            return;
        }
    }
    // =================================================================
    // === [ FIN DEL BLOQUE DE RECUPERACIÓN ] ============================
    // =================================================================
    
    // Lógica Normal de Trailing Stop

    const handlerDependencies = { config, creds, log, updateBotState, updateLStateData, updateGeneralBotState, botState };

    const { ac: acSelling, pm } = botState.lStateData;

    log("Estado Long: SELLING. Gestionando ventas...", 'info');
    
    const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100;
    const newPm = Math.max(pm || 0, currentPrice);
    const newPc = newPm * (1 - trailingStopPercent);

    if (newPm > (pm || 0)) {
        log(`Trailing Stop: PM actualizado a ${newPm.toFixed(2)}. PC actualizado a ${newPc.toFixed(2)} (${TRAILING_STOP_PERCENTAGE}% caída).`, 'info');
        await updateLStateData({ pm: newPm, pc: newPc });
    } else {
         log(`Esperando condiciones para la venta. Precio actual: ${currentPrice.toFixed(2)}, PM: ${newPm.toFixed(2)}, PC: ${newPc.toFixed(2)}`, 'info');
    }
    
    // 3. CONDICIÓN DE VENTA Y LIQUIDACIÓN (Validación USDT)
    const currentSellValueUsdt = acSelling * currentPrice;

    // ✅ CORRECCIÓN DE LA VALIDACIÓN: Usamos el valor en USDT
    if (currentSellValueUsdt >= MIN_SELL_USDT_EXCHANGE && !lastOrder) {
        if (currentPrice <= newPc) {
            log(`Condiciones de venta por Trailing Stop alcanzadas. Colocando orden de venta a mercado para liquidar ${acSelling.toFixed(8)} BTC.`, 'success');
            
            // LLAMADA: placeSellOrder coloca la orden y luego llama a handleSuccessfulSell al llenarse.
            await placeSellOrder(config, creds, acSelling, log, handleSuccessfulSell, botState, handlerDependencies);
        }
    } else if (acSelling > 0 && currentSellValueUsdt < MIN_SELL_USDT_EXCHANGE) {
        // Advertencia: Si el valor es insuficiente para el mínimo del exchange.
        log(`Advertencia: La cantidad acumulada para vender (${acSelling.toFixed(8)} BTC) vale ${currentSellValueUsdt.toFixed(2)} USDT, menor al mínimo del exchange (${MIN_SELL_USDT_EXCHANGE} USDT). Venta bloqueada.`, 'warning');
    }
}

module.exports = { 
    run, 
    handleSuccessfulSell
};