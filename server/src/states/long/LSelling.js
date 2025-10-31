// BSB/server/src/states/long/LSelling.js (FINAL - con Trailing Stop Fijo 0.4% y Recuperación Segura de Venta)

const { placeSellOrder } = require('../../utils/orderManager');
const { getOrderDetail } = require('../../../services/bitmartService'); 

const MIN_SELL_AMOUNT_BTC = 0.00005;

// Se asume que el manejo del Trailing Stop se basa en una caída fija.
const LSTATE = 'long'; 
// 💡 VALOR DEFINIDO POR EL USUARIO PARA EL TRAILING STOP (0.4%)
const TRAILING_STOP_PERCENTAGE = 0.4; 


// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL Y CIERRE DE CICLO
// =========================================================================

/**
 * Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
 * Esta función es invocada por orderManager.js o por la Lógica de Recuperación.
 * @param {object} botStateObj - Estado del bot antes de la venta.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {object} dependencies - Dependencias inyectadas (incluye config, log, updateGeneralBotState, etc.).
 */
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    // Aseguramos la extracción de todas las dependencias necesarias
    const { config, log, updateBotState, updateLStateData, updateGeneralBotState, creds } = dependencies;
    
    // 1. CÁLCULO DE CAPITAL Y GANANCIA
    const { ac: totalBtcSold, ppc } = botStateObj.lStateData; 
    
    // Usamos filledSize y priceAvg (o price) para asegurar precisión en la venta.
    const sellPrice = parseFloat(orderDetails.priceAvg || orderDetails.price); 
    // Nota: Dependemos de que orderDetails contenga la información correcta de BitMart.
    const filledSize = parseFloat(orderDetails.filled_volume || orderDetails.amount || 0); 
    
    const totalUsdtRecovered = filledSize * sellPrice; 
    const totalUsdtSpent = totalBtcSold * ppc; 
    const profit = totalUsdtRecovered - totalUsdtSpent;
    
    // 2. RECUPERACIÓN DE CAPITAL OPERATIVO Y GANANCIA (Campos de Nivel Superior)
    // Sumamos el monto total de USDT recuperado (Capital original + Profit)
    const newLBalance = botStateObj.lbalance + totalUsdtRecovered; 
    
    await updateGeneralBotState({ 
        lbalance: newLBalance,
        totalProfit: (botStateObj.totalProfit || 0) + profit, // 💡 CAMPO DE BENEFICIO ACUMULADO
        
        // 🎯 RESETEO DE DATOS DE ESTADO GENERAL Y CONTADORES
        ltprice: 0,         // Precio Objetivo
        lcoverage: 0,       // Monto de Cobertura Requerido
        lnorder: 0,         // Número de Órdenes
        lcycle: (botStateObj.lcycle || 0) + 1 // ¡Incrementar el contador de ciclo!
    });

    log(`Cierre de Ciclo Long Exitoso! Ganancia: ${profit.toFixed(2)} USDT.`, 'success');
    log(`LBalance actualizado. Capital operativo disponible: ${newLBalance.toFixed(2)} USDT.`, 'info');

    // 3. RESETEO DE DATOS DE CICLO ESPECÍFICOS (lStateData)
    const resetLStateData = { 
        ac: 0, ppc: 0, 
        orderCountInCycle: 0, // CRÍTICO: Reset a 0 para que LRunning inicie la compra.
        lastOrder: null, 
        pm: 0, pc: 0, pv: 0
    };
    await updateLStateData(resetLStateData); 
    
    // 4. TRANSICIÓN DE ESTADO (LÓGICA CRÍTICA DE REINICIO)
    if (config.long.stopAtCycle) {
        // Lógica 1: Si stopAtCycle es TRUE, el bot se DETIENE.
        log('Configuración: stopAtCycle activado. Bot Long se detendrá.', 'info');
        await updateBotState('STOPPED', LSTATE);
    } else {
        // Lógica 2: Si stopAtCycle es FALSE, el bot REINICIA INMEDIATAMENTE.
        // Importamos placeFirstBuyOrder aquí para evitar la dependencia circular.
        const { placeFirstBuyOrder } = require('../../utils/orderManager');

        log('Configuración: stopAtCycle desactivado. Reiniciando ciclo con nueva compra (BUYING).', 'info');
        
        // placeFirstBuyOrder colocará la orden inicial y transicionará a BUYING.
        // Pasamos 'config.long.purchaseUsdt' como monto para la primera compra.
        await placeFirstBuyOrder(config, creds, config.long.purchaseUsdt, log, updateBotState, updateGeneralBotState); 
    	
        // 🎯 [ADICIÓN DE SEGURIDAD]
// Ya que placeFirstBuyOrder no garantiza la transición después del éxito, forzamos el estado.
await updateBotState('BUYING', LSTATE);	
    }
}


// =========================================================================
// FUNCIÓN PRINCIPAL DE GESTIÓN DEL ESTADO SELLING
// =========================================================================

async function run(dependencies) {
    const { botState, currentPrice, config, creds, log, updateLStateData, updateBotState, updateGeneralBotState } = dependencies;
    
    // =================================================================
    // === [ BLOQUE CRÍTICO DE RECUPERACIÓN DE SERVIDOR ] ================
    // =================================================================
    const lastOrder = botState.lStateData.lastOrder;
const SYMBOL = config.symbol || 'BTC_USDT';

if (lastOrder && lastOrder.order_id && lastOrder.side === 'sell') {
    log(`Recuperación: Orden de venta pendiente con ID ${lastOrder.order_id} detectada en DB. Consultando BitMart...`, 'warning');

    try {
        // 1. Consultar el estado real de la orden en BitMart
        const orderDetails = await getOrderDetail(creds, SYMBOL, lastOrder.order_id);

        // Verifica si la orden fue llenada, incluso si luego fue cancelada (parcial)
        const isOrderFilled = orderDetails && (orderDetails.state === 'filled' || 
            (orderDetails.state === 'partially_canceled' && parseFloat(orderDetails.filled_volume || 0) > 0));

        if (isOrderFilled) {
            // Caso A: ORDEN LLENADA (Ejecución Exitosa después del reinicio)
            log(`Recuperación exitosa: La orden ID ${lastOrder.order_id} se completó durante el tiempo de inactividad.`, 'success');
            
            // Las dependencias necesarias para handleSuccessfulSell
            const handlerDependencies = { config, creds, log, updateBotState, updateLStateData, updateGeneralBotState };
            
            // 2. Procesar la venta exitosa (cierra ciclo, recupera capital, resetea estado)
            await handleSuccessfulSell(botState, orderDetails, handlerDependencies); 
            
            return; // Finaliza la ejecución, el ciclo se ha cerrado.

        } else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
            // Caso B: ORDEN AÚN ACTIVA (Esperar)
            log(`Recuperación: La orden ID ${lastOrder.order_id} sigue ${orderDetails.state} en BitMart. Esperando ejecución.`, 'info');
            return; // Detenemos la ejecución. No queremos que la lógica intente colocar OTRA orden.

        } else {
            // Caso C: ORDEN CANCELADA, FALLIDA o NO ENCONTRADA (y no se llenó)
            log(`La orden ID ${lastOrder.order_id} no está activa ni completada. Asumiendo fallo y permitiendo una nueva venta. Estado: ${orderDetails ? orderDetails.state : 'No Encontrada'}`, 'error');
            
            // 2. Limpiar lastOrder para liberar el ciclo SELLING.
            await updateLStateData({ 'lastOrder': null });
            
            // 3. Continuar la ejecución del código para intentar colocar la orden de venta de nuevo.
        }
    } catch (error) {
        // 🛑 NUEVO MANEJO DEL ERROR 50005 🛑
        if (error.message.includes('50005')) {
             log(`Advertencia: Orden ${lastOrder.order_id} desapareció del historial reciente (Error 50005). Asumiendo llenado instantáneo y forzando cierre de ciclo.`, 'warning');
            
            // Ejecutar el handler de éxito para cerrar el ciclo
            const handlerDependencies = { config, creds, log, updateBotState, updateLStateData, updateGeneralBotState };
            // Pasamos 'null' o un objeto base si orderDetails no está disponible, confiando en los datos de la DB.
            await handleSuccessfulSell(botState, { priceAvg: 0, filled_volume: botState.lStateData.ac }, handlerDependencies); 
            
            return; // Finaliza la ejecución para el siguiente ciclo.
        }

        log(`Error al consultar orden en BitMart durante la recuperación: ${error.message}`, 'error');
        return; // Para otros errores (red, autenticación), detenemos la ejecución para reintentar de forma segura.
    }
}
    // =================================================================
    // === [ FIN DEL BLOQUE DE RECUPERACIÓN ] ============================
    // =================================================================
    
    // El código de abajo es la Lógica Normal de Trailing Stop

    // Se definen las dependencias que necesitará el handler al ejecutarse (al llenar la orden de venta)
    const handlerDependencies = { config, creds, log, updateBotState, updateLStateData, updateGeneralBotState, botState };

    const { ac: acSelling, pm } = botState.lStateData;

    log("Estado Long: SELLING. Gestionando ventas...", 'info');
    
    // 💡 USAMOS EL VALOR FIJO DE 0.4% PARA EL TRAILING STOP, como se indica en la estrategia.
    const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100; // Convierte 0.4 a 0.004

    // 1. CÁLCULO DEL TRAILING STOP
    // El Precio Máximo (pm) solo debe subir
    const newPm = Math.max(pm || 0, currentPrice);
    // El Precio de Caída (pc) es el pm menos el porcentaje fijo de trailing stop
    const newPc = newPm * (1 - trailingStopPercent);

    // 2. ACTUALIZACIÓN Y PERSISTENCIA DE DATOS (PM y PC)
    // Solo persistir si el PM realmente subió.
    if (newPm > (pm || 0)) {
        log(`Trailing Stop: PM actualizado a ${newPm.toFixed(2)}. PC actualizado a ${newPc.toFixed(2)} (${TRAILING_STOP_PERCENTAGE}% caída).`, 'info');

        // Actualización atómica de PM y PC
        await updateLStateData({ pm: newPm, pc: newPc });
    } else {
         log(`Esperando condiciones para la venta. Precio actual: ${currentPrice.toFixed(2)}, PM: ${newPm.toFixed(2)}, PC: ${newPc.toFixed(2)}`, 'info');
    }
    
    // 3. CONDICIÓN DE VENTA Y LIQUIDACIÓN
    // CRÍTICO: Aseguramos que el monto a vender sea igual o mayor al mínimo.
    if (acSelling >= MIN_SELL_AMOUNT_BTC && !lastOrder) {
    if (currentPrice <= newPc) {
        log(`Condiciones de venta por Trailing Stop alcanzadas. Colocando orden de venta a mercado para liquidar ${acSelling.toFixed(8)} BTC.`, 'success');
        
        // LLAMADA: placeSellOrder coloca la orden y luego llama a handleSuccessfulSell al llenarse.
        await placeSellOrder(config, creds, acSelling, log, handleSuccessfulSell, botState, handlerDependencies);

        // Nota: El estado PERMANECE en SELLING hasta que la orden se confirme como FILLED (monitoreo superior).
    }
} else if (acSelling > 0 && acSelling < MIN_SELL_AMOUNT_BTC) {
    // Caso de advertencia: Si tenemos BTC pero es muy poco para vender.
    log(`Advertencia: La cantidad acumulada para vender (${acSelling.toFixed(8)} BTC) es menor al mínimo de la plataforma (${MIN_SELL_AMOUNT_BTC} BTC). Venta bloqueada.`, 'warning');
    }       
}

module.exports = { 
    run, 
    handleSuccessfulSell // Exportado para que orderManager.js pueda usarlo.
};
