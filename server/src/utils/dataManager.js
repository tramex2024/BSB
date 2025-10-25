// BSB/server/src/utils/dataManager.js

const Autobot = require('../../models/Autobot');
// Archivo simulado BSB/server/src/utils/dataManager.js
const { log } = require('../logger'); 
// Asume que estas funciones están definidas en otro lugar (ej. utils/calculations.js)
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
        // --- 1. CÁLCULO DE POSICIÓN (PPC y AC) ---

        const orderQty = parseFloat(orderDetails.fill_quantity || 0); // Cantidad de activo comprada
        const finalExecutionPrice = parseFloat(orderDetails.price || orderDetails.avg_price || 0); // Precio de ejecución
        const usdtSpent = parseFloat(orderDetails.notional || 0);

        if (orderQty === 0 || finalExecutionPrice === 0) {
            log(`[LONG] Error: Cantidad ejecutada (orderQty: ${orderQty}) o precio de ejecución (finalExecutionPrice: ${finalExecutionPrice}) es cero. No se puede actualizar la posición.`, 'error');
            return;
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


        // --- 2. GESTIÓN DEL CAPITAL RESTANTE (LBalance) - CORRECCIÓN ATÓMICA ---

        // Calculamos el capital no gastado para devolverlo al balance.
        const usdtToRefund = usdtAmount - usdtSpent;
        let newLBalance = parseFloat(botState.lbalance || 0);

        if (usdtToRefund > 0.01) { 
            // 🛑 CORRECCIÓN CRÍTICA: Modificamos LBalance en el objeto 'botState' 
            // y *ELIMINAMOS* la llamada a updateGeneralBotState para evitar la condición de carrera.
            
            const currentLBalance = parseFloat(botState.lbalance || 0);
            newLBalance = currentLBalance + usdtToRefund;
            
            log(`Devolviendo ${usdtToRefund.toFixed(2)} USDT al LBalance debido a ejecución parcial. Nuevo balance: ${newLBalance.toFixed(2)} USDT.`, 'info');
            
            // 1. Aplicamos el cambio de balance al objeto que vamos a guardar
            botState.lbalance = newLBalance;
            // ❌ Se ELIMINA la línea de updateGeneralBotState
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
        log(`Error al manejar la orden de compra exitosa (ID: ${orderDetails.order_id}): ${error.message}`, 'error');
        return null;
    }
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