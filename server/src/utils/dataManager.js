// BSB/server/src/utils/dataManager.js

const Autobot = require('../../models/Autobot');

/**
 * Maneja una compra exitosa (total o parcial), actualiza la posición del bot
 * (Price Mean y Total Count), y pasa al estado de gestión de posición (BUYING).
 *
 * @param {object} botState - Estado actual del bot (leído antes de la ejecución de la orden).
 * @param {object} orderDetails - Detalles de la orden ejecutada (de getOrderDetail).
 * @param {function} updateGeneralBotState - Función para actualizar el estado general (LBalance).
 * @param {function} log - Función de logging.
 */
async function handleSuccessfulBuy(botState, orderDetails, updateGeneralBotState, log) {
    const Autobot = require('../../models/Autobot'); 

    // --- 1. EXTRACCIÓN Y VALIDACIÓN DE DATOS DE LA ORDEN ---
    
    // Usamos parseFloat y aseguramos que el valor sea 0 si es null/undefined.
    const executedQty = parseFloat(orderDetails.filledSize || 0); // La cantidad de BTC comprada (tc_size)
    const executedAvgPrice = parseFloat(orderDetails.priceAvg || 0); // Precio promedio de ejecución real
    
    // El monto USDT que el bot intentó gastar (fue descontado del LBalance en placeFirstBuyOrder)
    const intendedUsdtSpent = parseFloat(botState.lStateData.lastOrder?.usdt_amount || 0); 
    // El monto REALMENTE gastado (del exchange)
    const actualUsdtSpent = parseFloat(orderDetails.notional || 0); 

    // Determinar el precio final a usar. priceAvg (precio promedio) tiene prioridad.
    // 🚨 ESTE ES EL PRECIO DE EJECUCIÓN PONDERADO QUE DEBEMOS ALMACENAR
    const finalExecutionPrice = executedAvgPrice > 0 ? executedAvgPrice : parseFloat(orderDetails.price || 0);
    
    // Si no se ejecutó nada, o el precio es ilógico, salimos.
    if (executedQty <= 0 || finalExecutionPrice <= 0) {
        log('Error de procesamiento de compra: handleSuccessfulBuy llamado con ejecución o precio cero. Limpiando lastOrder.', 'error');
        // Limpiamos el lastOrder y dejamos el estado en BUYING/RUNNING si no hay posición.
        await Autobot.findOneAndUpdate({}, { 'lStateData.lastOrder': null });
        return; 
    }

    // --- 2. CÁLCULO DEL NUEVO PRECIO PROMEDIO DE COMPRA (PPC) ---
    // Nota: Renombrar pm (precio medio) a ppc (precio promedio de compra) en la DB

    // Extraer datos de la posición actual con seguridad (si es la primera orden, serán 0)
    const currentTotalQty = parseFloat(botState.lStateData.ac || 0); // Cantidad Total (AC) actual
    const currentPriceMean = parseFloat(botState.lStateData.ppc || 0); // Precio Promedio de Compra (PPC) actual
    
    // Definir el contador de órdenes para el incremento
    const currentOrderCount = parseInt(botState.lStateData.orderCountInCycle || 0); 
    
    // Costo total actual de la posición y costo de la nueva orden
    const currentTotalCost = currentTotalQty * currentPriceMean;
    const newOrderCost = executedQty * finalExecutionPrice; // Usamos el precio de ejecución final
    
    // Nuevo tamaño total de la posición (denominador)
    const newTotalQty = currentTotalQty + executedQty;

    // Calculamos el nuevo precio promedio de compra (PPC)
    let newPriceMean = currentPriceMean; 
    
    if (newTotalQty > 0) {
        // CORRECCIÓN CLAVE: Evitamos la división por cero y aseguramos el cálculo.
        newPriceMean = (currentTotalCost + newOrderCost) / newTotalQty;
        // También verificamos el resultado por si acaso, usando el precio anterior si es inválido.
        if (isNaN(newPriceMean)) newPriceMean = currentPriceMean; 
    }

    // --- 3. GESTIÓN DEL CAPITAL RESTANTE (LBalance) ---

    // ********** LÓGICA AVANZADA: DEVOLUCIÓN DE CAPITAL (CORRECCIÓN) **********
    
    // Monto a devolver al LBalance (lo que se descontó vs lo que se gastó)
    const usdtToRefund = intendedUsdtSpent - actualUsdtSpent;

    if (usdtToRefund > 0.01) { // Usamos un umbral para evitar errores de redondeo minúsculos
        const currentLBalance = parseFloat(botState.lbalance || 0);
        const newLBalance = currentLBalance + usdtToRefund;

        log(`Devolviendo ${usdtToRefund.toFixed(2)} USDT al LBalance debido a ejecución parcial. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');

        // Actualizar el LBalance en el documento principal de la DB
        await updateGeneralBotState({ lbalance: newLBalance });
    }

    // ************************************************************
    
    // --- 4. ACTUALIZAR ESTADO DE LA BASE DE DATOS ---

    // La transición es siempre a BUYING para gestionar la posición/cobertura.
    const nextState = 'BUYING'; 
    
    // Usar $set para actualizar campos individuales del sub-documento de forma segura.
    const update = {
        'lstate': nextState,
        'lStateData.ac': newTotalQty, // AC es la cantidad total
        'lStateData.ppc': newPriceMean, // PPC es el precio promedio de compra
        // 🚨 NUEVO CAMPO: Guardamos el precio de ejecución de la ÚLTIMA orden
        'lStateData.lastExecutionPrice': finalExecutionPrice, 
        
        'lStateData.orderCountInCycle': currentOrderCount + 1, // Aumentar el contador
        'lStateData.lastOrder': null, // Limpiar la última orden (se completó)
        
        // El PM (Precio Máximo) debe actualizarse aquí si se compró a un precio más alto.
        // Pero dado que esta lógica es solo para COMPRA (bajando), lo más seguro es actualizar PM
        // en LBuying.js o mantenerlo como el precio de ejecución para el cálculo inicial del PC.
        // Lo dejaremos para LBuying.js para no crear redundancia.
    };
    
    // Actualizar el documento en la DB con el nuevo precio de ejecución
    await Autobot.findOneAndUpdate({}, { $set: update });

    log(`[LONG] Orden confirmada. Nuevo PPC: ${newPriceMean.toFixed(2)}, Qty Total (AC): ${newTotalQty.toFixed(8)}. Precio de ejecución: ${finalExecutionPrice.toFixed(2)}. Transicionando a ${nextState}.`, 'info');

    // Notificación:
    await updateGeneralBotState({ lstate: nextState }); 
}

/**
 * Lógica para manejar una orden de venta exitosa (cierre de ciclo Long).
 * @param {object} botStateObj - Estado del bot antes de la venta.
 * @param {object} orderDetails - Detalles de la orden de BitMart completada.
 * @param {object} dependencies - Dependencias necesarias (DEBE incluir 'log').
 */
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

async function resetAndInitializeBot(log) {
    // 1. OBTENER CONFIGURACIÓN ACTUAL (Para no perder los settings del usuario)
    const currentBot = await Autobot.findOne({});
    
    // Si no hay documento, usamos la configuración por defecto
    const config = currentBot ? currentBot.config : { /* ... tus valores por defecto ... */ }; 
    const initialLBalance = config.long.amountUsdt || 0; // Usar 15 USDT como base
    const totalProfit = currentBot ? currentBot.totalProfit : 0; // Preservar ganancias

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
    handleSuccessfulSell
};