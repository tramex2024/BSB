// BSB/server/src/states/short/SSelling.js (FINAL - con Trailing Stop Inverso 0.4% y Recuperación Segura de Recompra)

const { placeBuyOrder } = require('../../utils/orderManager');
const { getOrderDetail } = require('../../../services/bitmartService'); 

// Se asume que el manejo del Trailing Stop se basa en una caída fija.
const SSTATE = 'short'; 
// 💡 VALOR DEFINIDO POR EL USUARIO PARA EL TRAILING STOP (0.4%)
const TRAILING_STOP_PERCENTAGE = 0.4; 


// =========================================================================
// FUNCIÓN HANDLER: LÓGICA DE RECUPERACIÓN DE CAPITAL Y CIERRE DE CICLO
// =========================================================================

/**
 * Lógica para manejar una orden de recompra (cierre de Short) exitosa.
 * @param {object} botStateObj - Estado del bot antes de la recompra.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada (Compra).
 * @param {object} dependencies - Dependencias inyectadas.
 */
async function handleSuccessfulBuy(botStateObj, orderDetails, dependencies) {
    // Aseguramos la extracción de todas las dependencias necesarias
    const { config, log, updateBotState, updateSStateData, updateGeneralBotState, creds } = dependencies;
    
    // 1. CÁLCULO DE CAPITAL Y GANANCIA
    const { ac: totalBtcToBuy, ppc } = botStateObj.sStateData; 
    
    // Usamos filledSize y priceAvg (o price) para asegurar precisión en la compra.
    const buyPrice = parseFloat(orderDetails.priceAvg || orderDetails.price); 
    const filledSize = parseFloat(orderDetails.filled_volume || orderDetails.amount || 0); 
    
    // Ganancia Short = Capital de Venta - Capital de Recompra
    const totalUsdtSold = totalBtcToBuy * ppc; // Capital que obtuvimos al vender originalmente (PPC)
    const totalUsdtSpentOnBuy = filledSize * buyPrice; // Capital gastado al recomprar
    
    // Profit solo se calcula sobre la porción cubierta
    const profit = totalUsdtSold - totalUsdtSpentOnBuy; 
    
    // 2. RECUPERACIÓN DE CAPITAL OPERATIVO Y GANANCIA (Campos de Nivel Superior)
    // El balance Short (sbalance, en BTC) aumenta al recomprar
    const newSBalance = botStateObj.sbalance + totalBtcToBuy; // Devolvemos el BTC que se recompró
    
    await updateGeneralBotState({ 
        sbalance: newSBalance,
        totalProfit: (botStateObj.totalProfit || 0) + profit, // 💡 CAMPO DE BENEFICIO ACUMULADO
        
        // 🎯 RESETEO DE DATOS DE ESTADO GENERAL Y CONTADORES
        stprice: 0,         // Precio Objetivo
        scoverage: 0,       // Precio de Cobertura
        snorder: 0,         // Número de Órdenes
        scycle: (botStateObj.scycle || 0) + 1 // ¡Incrementar el contador de ciclo!
    });

    log(`Cierre de Ciclo Short Exitoso! Ganancia Neta: ${profit.toFixed(2)} USDT.`, 'success');
    log(`SBalance actualizado. Capital operativo disponible: ${newSBalance.toFixed(8)} BTC.`, 'info');

    // 3. RESETEO DE DATOS DE CICLO ESPECÍFICOS (sStateData)
    const resetSStateData = { 
        ac: 0, ppc: 0, 
        orderCountInCycle: 0, // CRÍTICO: Reset a 0 para que SBuying inicie la venta.
        lastOrder: null, 
        pm: 0, pc: 0, pv: 0 // Usamos PM (Price Minimum) y PC (Price Ceiling)
    };
    await updateSStateData(resetSStateData); 
    
    // 4. TRANSICIÓN DE ESTADO (LÓGICA CRÍTICA DE REINICIO)
    if (config.short.stopAtCycle) {
        // Lógica 1: Si stopAtCycle es TRUE, el bot se DETIENE.
        log('Configuración: stopAtCycle activado. Bot Short se detendrá.', 'info');
        await updateBotState('STOPPED', SSTATE);
    } else {
        // Lógica 2: Si stopAtCycle es FALSE, el bot REINICIA INMEDIATAMENTE.
        // Importamos placeInitialSellOrder aquí para evitar la dependencia circular.
        const { placeInitialSellOrder } = require('../../utils/orderManager');

        log('Configuración: stopAtCycle desactivado. Reiniciando ciclo con nueva venta (BUYING).', 'info');
        
        // placeInitialSellOrder colocará la orden inicial y transicionará a BUYING.
        await placeInitialSellOrder(botState, config.short.sellBtc, log, updateGeneralBotState); 
    }
}


// =========================================================================
// FUNCIÓN PRINCIPAL DE GESTIÓN DEL ESTADO SELLING
// =========================================================================

async function run(dependencies) {
    const { botState, currentPrice, config, creds, log, updateSStateData, updateBotState, updateGeneralBotState } = dependencies;
    
    // =================================================================
    // === [ BLOQUE CRÍTICO DE RECUPERACIÓN DE SERVIDOR ] ================
    // =================================================================
    const lastOrder = botState.sStateData.lastOrder;
    const SYMBOL = config.symbol || 'BTC_USDT';

    // En SSelling, esperamos una orden de COMPRA (buy) para recomprar/cerrar la posición.
    if (lastOrder && lastOrder.order_id && lastOrder.side === 'buy') {
        log(`Recuperación: Orden de recompra pendiente con ID ${lastOrder.order_id} detectada en DB. Consultando BitMart...`, 'warning');

        try {
            // 1. Consultar el estado real de la orden en BitMart
            const orderDetails = await getOrderDetail(creds, SYMBOL, lastOrder.order_id);

            // Verifica si la orden fue llenada, incluso si luego fue cancelada (parcial)
            const isOrderFilled = orderDetails && (orderDetails.state === 'filled' || 
                (orderDetails.state === 'partially_canceled' && parseFloat(orderDetails.filled_volume || 0) > 0));

            if (isOrderFilled) {
                // Caso A: ORDEN LLENADA (Ejecución Exitosa después del reinicio)
                log(`Recuperación exitosa: La orden ID ${lastOrder.order_id} se completó durante el tiempo de inactividad.`, 'success');
                
                // Las dependencias necesarias para handleSuccessfulBuy
                const handlerDependencies = { config, creds, log, updateBotState, updateSStateData, updateGeneralBotState };
                
                // 2. Procesar la recompra exitosa (cierra ciclo, recupera capital, resetea estado)
                await handleSuccessfulBuy(botState, orderDetails, handlerDependencies); 
                
                return; // Finaliza la ejecución, el ciclo se ha cerrado.

            } else if (orderDetails && (orderDetails.state === 'new' || orderDetails.state === 'partially_filled')) {
                // Caso B: ORDEN AÚN ACTIVA (Esperar)
                log(`Recuperación: La orden ID ${lastOrder.order_id} sigue ${orderDetails.state} en BitMart. Esperando ejecución.`, 'info');
                return;

            } else {
                // Caso C: ORDEN CANCELADA, FALLIDA o NO ENCONTRADA (y no se llenó)
                log(`La orden ID ${lastOrder.order_id} no está activa ni completada. Asumiendo fallo y permitiendo una nueva recompra. Estado: ${orderDetails ? orderDetails.state : 'No Encontrada'}`, 'error');
                
                // 2. Limpiar lastOrder para liberar el ciclo SELLING.
                await updateSStateData({ 'lastOrder': null });
                
                // 3. Continuar la ejecución del código para intentar colocar la orden de recompra de nuevo.
            }
        } catch (error) {
            log(`Error al consultar orden en BitMart durante la recuperación: ${error.message}`, 'error');
            return; // Detenemos la ejecución. Es más seguro esperar el siguiente ciclo.
        }
    }
    // =================================================================
    // === [ FIN DEL BLOQUE DE RECUPERACIÓN ] ============================
    // =================================================================
    
    // El código de abajo es la Lógica Normal de Trailing Stop

    // Se definen las dependencias que necesitará el handler al ejecutarse (al llenar la orden de recompra)
    const handlerDependencies = { config, creds, log, updateBotState, updateSStateData, updateGeneralBotState, botState };

    const { ac: acBuying, pm } = botState.sStateData; // AC es la cantidad neta vendida en Short.

    log("Estado Short: SELLING (Cierre). Gestionando recompra...", 'info');
    
    // 💡 USAMOS EL VALOR FIJO DE 0.4% PARA EL TRAILING STOP.
    const trailingStopPercent = TRAILING_STOP_PERCENTAGE / 100; // Convierte 0.4 a 0.004

    // 1. CÁLCULO DEL TRAILING STOP INVERSO
    // El Precio Mínimo (pm) solo debe caer
    const newPm = Math.min(pm || currentPrice, currentPrice); // Aquí usamos Math.min
    // El Precio de Techo (pc) es el pm MÁS el porcentaje fijo de trailing stop
    const newPc = newPm * (1 + trailingStopPercent);

    // 2. ACTUALIZACIÓN Y PERSISTENCIA DE DATOS (PM y PC)
    // Solo persistir si el PM realmente BAJÓ (o si pm era 0).
    if (newPm < (pm || currentPrice * 10)) { // Usamos un chequeo inverso y seguro
        log(`Trailing Stop Inverso: PM actualizado a ${newPm.toFixed(2)}. PC (Techo) actualizado a ${newPc.toFixed(2)} (+${TRAILING_STOP_PERCENTAGE}% subida).`, 'info');

        // Actualización atómica de PM y PC
        await updateSStateData({ pm: newPm, pc: newPc });
    } else {
         log(`Esperando condiciones para la recompra. Precio actual: ${currentPrice.toFixed(2)}, PM: ${newPm.toFixed(2)}, PC: ${newPc.toFixed(2)}`, 'info');
    }
    
    // 3. CONDICIÓN DE RECOMPRA Y CIERRE
    if (acBuying > 0 && !lastOrder) {
        // Condición de Liquidación Short: El precio subió y alcanzó el techo (PC)
        if (currentPrice >= newPc) {
            log(`Condiciones de recompra por Trailing Stop alcanzadas. Colocando orden de COMPRA a mercado para liquidar ${acBuying.toFixed(8)} BTC (cierre Short).`, 'success');
            
            // LLAMADA: placeBuyOrder coloca la orden y luego llama a handleSuccessfulBuy al llenarse.
            await placeBuyOrder(config, creds, acBuying, log, handleSuccessfulBuy, botState, handlerDependencies);

            // Nota: El estado PERMANECE en SELLING hasta que la orden se confirme como FILLED.
        }
    } else if (acBuying <= 0) {
        log('Advertencia: Posición AC es 0 o negativa en SSelling. El ciclo ya fue cerrado o no está activo. Limpiando estado.', 'error');
        // Transicionamos a STOPPED para forzar un reinicio limpio.
        await updateBotState('STOPPED', SSTATE);
    }
    
    
}

module.exports = { 
    run, 
    handleSuccessfulBuy // Exportado para que orderManager.js pueda usarlo.
};