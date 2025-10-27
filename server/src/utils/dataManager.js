// Archivo BSB/server/src/utils/dataManager.js

const { log } = require('../logger'); 
// CORRECCIÓN DE RUTA Y NOMBRE DE ARCHIVO
const { calculateNextTarget, calculateNextCoverage } = require('../../autobotCalculations'); 

/**
 * Maneja una ejecución de orden de COMPRA (LONG) exitosa, ya sea total o parcial.
 * Actualiza la posición (PPC, AC) y el estado del bot (lstate, lbalance) de forma atómica.
 * * @param {Object} botState El objeto Autobot Mongoose (versión más reciente).
 * @param {Object} orderDetails Los detalles de la orden ejecutada de BitMart.
 * @param {number} usdtAmount El monto total en USDT solicitado en la orden.
 */
async function handleSuccessfulBuy(botState, orderDetails, usdtAmount) {
    try {
        const orderUsdtAmount = parseFloat(usdtAmount || 0);

        // --- 1. CÁLCULO DE POSICIÓN (PPC y AC) ---

        // Extracción de datos de la orden. Usamos fill_quantity y notional para datos reales de ejecución.
        const orderQty = parseFloat(orderDetails.fill_quantity || 0); // Cantidad de activo comprada
        const usdtSpent = parseFloat(orderDetails.notional || 0); // Costo real en USDT de la parte ejecutada
        const finalExecutionPrice = parseFloat(orderDetails.avg_price || orderDetails.price || 0); // Precio de ejecución

        // Verificamos si los valores esenciales son cero o inválidos
        if (orderQty <= 0 || usdtSpent <= 0 || finalExecutionPrice <= 0) {
            log(`[LONG] Fallo en la extracción de datos. orderQty: ${orderQty}, usdtSpent: ${usdtSpent}, finalPrice: ${finalExecutionPrice}`, 'error');
            log(`[LONG] Error: Cantidad ejecutada, costo de ejecución o precio es cero/inválido. No se puede actualizar la posición.`, 'error');
            
            // Lógica de reembolso original y más simple:
            if (orderDetails.state === 'partially_canceled' || orderDetails.state === 'canceled') {
                log(`[LONG] Orden marcada como cancelada/parcial. Reembolsando el monto completo de ${orderUsdtAmount} USDT al LBalance.`, 'warning');
                
                const currentLBalance = parseFloat(botState.lbalance || 0);
                
                // CRÍTICO: Aseguramos que orderUsdtAmount sea un número. 
                // Si el error persiste, sabremos que el NaN viene del scope exterior.
                if (isNaN(orderUsdtAmount)) {
                    log('[LONG] ERROR: orderUsdtAmount sigue siendo NaN. DETENIENDO PROCESO DE REEMBOLSO Y GUARDADO.', 'error');
                    return null;
                }

                botState.lbalance = currentLBalance + orderUsdtAmount;
                
                botState.markModified('lStateData');
                await botState.save(); 
                return botState;
            }
            
            return null;
        }

        const currentPPC = parseFloat(botState.lStateData.ppc || 0);
        const currentAC = parseFloat(botState.lStateData.ac || 0);

        // Nuevo Capital Total Invertido (USD)
        const newTotalInvestment = (currentPPC * currentAC) + usdtSpent;
        // Nueva Cantidad Total de Activo (BTC/AC)
        const newTotalQty = currentAC + orderQty;
        // Nuevo Precio Promedio de Compra (PPC)
        const newPPC = newTotalInvestment / newTotalQty;
        
        const currentOrderCount = parseInt(botState.lnorder || 0);

        log(`[LONG] Cálculo: AC Anterior: ${currentAC.toFixed(8)}, Qty Comprada: ${orderQty.toFixed(8)}, AC Nuevo: ${newTotalQty.toFixed(8)}`, 'debug');
        log(`[LONG] Cálculo: PPC Anterior: ${currentPPC.toFixed(2)}, Costo Orden: ${usdtSpent.toFixed(2)}, PPC Nuevo: ${newPPC.toFixed(2)}`, 'debug');


        // --- 2. GESTIÓN DEL CAPITAL RESTANTE (LBalance) ---

        // Calculamos el capital no gastado para devolverlo al balance.
        const usdtToRefund = orderUsdtAmount - usdtSpent;
        
        if (usdtToRefund > 0.01) { 
            const currentLBalance = parseFloat(botState.lbalance || 0);
            const newLBalance = currentLBalance + usdtToRefund;
            
            log(`Devolviendo ${usdtToRefund.toFixed(2)} USDT al LBalance debido a ejecución parcial. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');
            
            botState.lbalance = newLBalance;
        }

        // --- 3. CÁLCULO DE OBJETIVOS (Venta y Cobertura) ---
        const config = botState.config.long;
        
        // Objetivo de Venta (ltprice)
        const newLtPrice = calculateNextTarget(newPPC, config.profit_percent);
        
        // Objetivo de Cobertura (lcoverage)
        const nextCoveragePrice = calculateNextCoverage(newPPC, config.price_var);
        
        log(`Targets Iniciales establecidos. Venta (ltprice): ${newLtPrice.toFixed(2)}, Próxima Cobertura: ${nextCoveragePrice.toFixed(2)} (${config.purchaseUsdt.toFixed(2)} USDT)`, 'info');

        // --- 4. ACTUALIZAR ESTADO DE LA BASE DE DATOS (Una Sola Escritura Atómica) ---

        const nextState = 'BUYING'; 
        
        // 1. Aplicamos los cambios de nivel raíz
        botState.lstate = nextState;
        botState.lnorder = currentOrderCount + 1; // Incrementamos el número de órdenes en el ciclo
        botState.ltprice = newLtPrice; // Nuevo target de venta
        botState.lcoverage = nextCoveragePrice; // Nuevo target de cobertura
        
        // 2. Aplicamos los datos del subdocumento lStateData
        botState.lStateData.ac = newTotalQty;        
        botState.lStateData.ppc = newPPC;            
        botState.lStateData.lastExecutionPrice = finalExecutionPrice; 
        botState.lStateData.orderCountInCycle = currentOrderCount + 1; 
        botState.lStateData.lastOrder = null;        
        
        // 3. Forzamos a Mongoose a reconocer el cambio en el subdocumento
        botState.markModified('lStateData');
        
        // 4. Guardamos TODOS los cambios (lbalance, lstate, ppc, ac) en una sola operación.
        await botState.save(); 

        log(`[LONG] Orden confirmada. Nuevo PPC: ${newPPC.toFixed(2)}, Qty Total (AC): ${newTotalQty.toFixed(8)}. Precio de ejecución: ${finalExecutionPrice.toFixed(2)}. Transicionando a ${nextState}.`, 'info');
        
        return botState;

    } catch (error) {
        log(`Error al manejar la orden de compra exitosa (ID: ${orderDetails?.order_id || 'undefined'}): ${error.message}`, 'error');
        return null;
    }
}

// Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
async function handleSuccessfulSell(botStateObj, orderDetails, dependencies) {
    // Importación Tardia: Se carga el módulo SOLO cuando se ejecuta esta función.
    const { handleSuccessfulSell: LSellingHandler } = require('../states/long/LSelling');
    
    // LSellingHandler se encargará de:
    // 1. Calcular ganancia/pérdida (usando dependencies.log para registrar).
    // 2. Sumar la ganancia al LBalance.
    // 3. Limpiar lStateData (PPC, AC, etc.).
    // 4. Transicionar a 'RUNNING'.
    await LSellingHandler(botStateObj, orderDetails, dependencies);
}

// Lógica de reseteo (asume que existe)
async function resetAndInitializeBot(log) {
    const Autobot = require('../../models/Autobot'); 
    
    // 1. OBTENER CONFIGURACIÓN ACTUAL (Para no perder los settings del usuario)
    const currentBot = await Autobot.findOne({});
    
    // Si no hay documento, usamos la configuración por defecto
    const config = currentBot ? currentBot.config : { /* ... tus valores por defecto ... */ }; 
    const initialLBalance = config.long.amountUsdt || 0; // Usar 15 USDT como base
    const totalProfit = currentBot ? currentBot.total_profit : 0; // Preservar ganancias
    
    // 2. ELIMINAR el documento existente
    await Autobot.deleteMany({});
    log('Documento Autobot eliminado completamente.', 'error');
    
    // 3. CREAR el objeto base limpio
    const newBotData = {
        "lstate": "RUNNING", // Estado inicial de un bot que se inicia/resetea
        "sstate": "RUNNING",
        
        "config": config,
        "total_profit": totalProfit,
        
        // 🎯 INICIALIZACIÓN CRÍTICA
        "lbalance": initialLBalance, // Usar el capital de la configuración (15 USDT)
        "sbalance": config.short.amountBtc || 0, // Si usas balance corto
        
        // Todos los contadores de ciclo y posición a CERO
        "lStateData": { "ppc": 0, "ac": 0, "ppv": 0, "av": 0, "orderCountInCycle": 0, "lastOrder": null, "pm": 0, "pc": 0, "requiredCoverageAmount": 0, "nextCoveragePrice": 0 },
        "sStateData": { "ppc": 0, "ac": 0, "ppv": 0, "av": 0, "orderCountInCycle": 0, "lastOrder": null, "pm": 0, "pc": 0, "requiredCoverageAmount": 0, "nextCoveragePrice": 0 },
        
        "lcycle": 0, "lnorder": 0, "ltprice": 0,
        "scycle": 0, "snorder": 0, "stprice": 0,
    };
    
    const newAutobot = new Autobot(newBotData);
    await newAutobot.save();
    
    log(`Documento Autobot creado. LBalance inicializado a ${initialLBalance} USDT. Listo para operar.`, 'info');
}

module.exports = {
    handleSuccessfulBuy,
    handleSuccessfulSell,
    // La función resetAndInitializeBot también debería ser exportada si se usa externamente
    resetAndInitializeBot
};



///////////////////////// PROBAR SUSTITUIR ESTA FUNCION   /////////////////




// BSB/server/src/utils/dataManager.js (FUNCIÓN handleSuccessfulBuy - Completa)

/**
 * Maneja una compra exitosa (total o parcial), actualiza la posición del bot
 * (PPC, AC, lastExecutionPrice), y pasa al estado de gestión de posición (BUYING).
 *
 * @param {object} botState - Estado actual del bot (leído antes de la ejecución de la orden).
 * @param {object} orderDetails - Detalles de la orden ejecutada (de getOrderDetail).
 * @param {function} updateGeneralBotState - Función para actualizar el estado general (LBalance).
 * @param {function} log - Función de logging.
 */
async function handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState, log) {
    // Importamos Autobot aquí si dataManager.js no lo importa globalmente
    const Autobot = require('../../models/Autobot'); 

    // --- 1. EXTRACCIÓN Y VALIDACIÓN DE DATOS DE LA ORDEN ---
    
    const executedQty = parseFloat(orderDetails.filledSize || 0); // Cantidad de activo comprada
    const executedAvgPrice = parseFloat(orderDetails.priceAvg || 0); // Precio promedio de ejecución real
    
    const intendedUsdtSpent = parseFloat(botState.lStateData.lastOrder?.usdt_amount || 0); 
    const actualUsdtSpent = parseFloat(orderDetails.notional || 0); 

    // Obtener el precio de ejecución real.
    const finalExecutionPrice = executedAvgPrice > 0 ? executedAvgPrice : parseFloat(orderDetails.price || 0);
    
    if (executedQty <= 0 || finalExecutionPrice <= 0) {
        log('Error de procesamiento de compra: handleSuccessfulBuy llamado con ejecución o precio cero. Limpiando lastOrder.', 'error');
        await Autobot.findOneAndUpdate({}, { 'lStateData.lastOrder': null });
        return; 
    }

    // --- 2. CÁLCULO DEL NUEVO PRECIO PROMEDIO DE COMPRA (PPC) y AC ---

    const currentTotalQty = parseFloat(botState.lStateData.ac || 0); 
    const currentPriceMean = parseFloat(botState.lStateData.ppc || 0); 
    
    const currentOrderCount = parseInt(botState.lStateData.orderCountInCycle || 0); 
    
    // Costo total actual de la posición y costo de la nueva orden
    const currentTotalCost = currentTotalQty * currentPriceMean;
    const newOrderCost = executedQty * finalExecutionPrice; 
    
    // Nuevo tamaño total de la posición (AC)
    const newTotalQty = currentTotalQty + executedQty;

    // Calculamos el nuevo precio promedio de compra (PPC)
    let newPPC = currentPriceMean; 
    
    if (newTotalQty > 0) {
        newPPC = (currentTotalCost + newOrderCost) / newTotalQty;
        if (isNaN(newPPC)) newPPC = currentPriceMean; 
    }

    // --- 3. GESTIÓN DEL CAPITAL RESTANTE (LBalance) ---

    const usdtToRefund = intendedUsdtSpent - actualUsdtSpent;

    if (usdtToRefund > 0.01) { 
        const currentLBalance = parseFloat(botState.lbalance || 0);
        const newLBalance = currentLBalance + usdtToRefund;
        log(`Devolviendo ${usdtToRefund.toFixed(2)} USDT al LBalance debido a ejecución parcial. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');
        // Usamos la función de utilidad para la notificación/persistencia del balance
        await updateGeneralBotState({ lbalance: newLBalance }); 
    }
    
    // --- 4. ACTUALIZAR ESTADO DE LA BASE DE DATOS (Corrección de Persistencia) ---

    const nextState = 'BUYING'; 
    
    // 🛑 CORRECCIÓN CLAVE: Modificamos el objeto 'botState' que Mongoose rastrea.
    botState.lstate = nextState;
    botState.lStateData.ac = newTotalQty;        // Guardar la Cantidad Total (AC)
    botState.lStateData.ppc = newPPC;            // Guardar el nuevo PPC
    botState.lStateData.lastExecutionPrice = finalExecutionPrice; // Precio de la ÚLTIMA orden
    
    botState.lStateData.orderCountInCycle = currentOrderCount + 1; 
    botState.lStateData.lastOrder = null;        // Limpiar la última orden
    
    // ✅ Usamos .save() en el objeto que ya se leyó, que es más fiable para subdocumentos
    await botState.save(); 

    log(`[LONG] Orden confirmada. Nuevo PPC: ${newPPC.toFixed(2)}, Qty Total (AC): ${newTotalQty.toFixed(8)}. Precio de ejecución: ${finalExecutionPrice.toFixed(2)}. Transicionando a ${nextState}.`, 'info');

    // La función de ayuda ya no es necesaria si usamos botState.save()
    // await updateGeneralBotState({ lstate: nextState }); 
}
