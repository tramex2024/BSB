/**
 * BSB/server/autobotCalculations.js (SOLO LÓGICA LONG Y COMÚN)
 */

const { parseNumber } = require('./utils/helpers'); // Importa el helper

// 🛑 ELIMINADA LA IMPORTACIÓN: const { calculateShortCoverage, calculateShortTargets } = require('./calculateShortTargets');

// -------------------------------------------------------------------------
// LÓGICA DE COBERTURA (LONG)
// -------------------------------------------------------------------------
function calculateLongCoverage(lbalance, currentPrice, purchaseUsdt, priceVarDecimal, sizeVarDecimal, orderCountInCycle = 0) {
    let currentBalance = lbalance;
    let nextOrderPrice = currentPrice;
    
    // 🎯 CORRECCIÓN: Calcular el monto de la "siguiente" orden real según el ciclo actual
    // Si orderCountInCycle es 3, la siguiente orden es la 4ta.
    let nextOrderAmount = purchaseUsdt * Math.pow((1 + sizeVarDecimal), orderCountInCycle);
    
    let numberOfOrders = 0;
    let lastCoveragePrice = currentPrice;

    // Ajuste: El ciclo debe validar ANTES de contar la orden
    while (currentBalance >= nextOrderAmount && nextOrderAmount > 0) {
        currentBalance -= nextOrderAmount;
        numberOfOrders++;
        
        lastCoveragePrice = nextOrderPrice;

        // Preparamos los datos para la SIGUIENTE orden
        nextOrderPrice = nextOrderPrice * (1 - priceVarDecimal);
        nextOrderAmount = nextOrderAmount * (1 + sizeVarDecimal);
        
        if (numberOfOrders > 50) break; 
    }

    return { 
        coveragePrice: lastCoveragePrice, 
        numberOfOrders: numberOfOrders 
    };
}

// -------------------------------------------------------------------------
// FUNCIÓN AUXILIAR DCA (Long)
// -------------------------------------------------------------------------
function calculateNextDcaPrice(ppc, priceVarDecimal, count) {
    // 💡 count no se usa en esta fórmula, solo en el cálculo recursivo de coverage.
    return ppc * (1 - priceVarDecimal);
}

// -------------------------------------------------------------------------
// LÓGICA DE TARGETS POST-COMPRA (LONG)
// -------------------------------------------------------------------------
function calculateLongTargets(ppc, profit_percent, price_var, size_var, basePurchaseUsdt, orderCountInCycle, lbalance, lastExecutionPrice) {
    const profitDecimal = parseNumber(profit_percent) / 100;
    const priceVarDecimal = parseNumber(price_var) / 100;
    const sizeVarDecimal = parseNumber(size_var) / 100;
    const baseAmount = parseNumber(basePurchaseUsdt);
    const count = orderCountInCycle || 0;
    const balance = parseNumber(lbalance);

    const targetSellPrice = ppc * (1 + profitDecimal);
    
    // Determinamos el precio de referencia para la siguiente caída
    const referencePrice = (count > 0 && lastExecutionPrice > 0) ? lastExecutionPrice : ppc;
    const nextCoveragePrice = referencePrice * (1 - priceVarDecimal);

    // 🎯 LLAMADA ÚNICA Y LIMPIA:
    // Dejamos que calculateLongCoverage decida si el balance alcanza para la orden 'count'
    const { coveragePrice: lCoveragePrice, numberOfOrders: lNOrderMax } = calculateLongCoverage(
        balance,
        nextCoveragePrice,
        baseAmount, // Pasamos el BASE, la función se encarga de elevarlo a la potencia 'count'
        priceVarDecimal,
        sizeVarDecimal,
        count       // Pasamos el ciclo actual
    );

    return { 
        targetSellPrice, 
        nextCoveragePrice, 
        requiredCoverageAmount: baseAmount * Math.pow((1 + sizeVarDecimal), count),
        lCoveragePrice, 
        lNOrderMax 
    };
}

// -------------------------------------------------------------------------
// LÓGICA DE ESTADO INICIAL (DEBE SER MÍNIMA O MOVIDA)
// -------------------------------------------------------------------------

// 🛑 calculateInitialState ahora SOLO usa la lógica Long y NO la Short
function calculateInitialState(config, currentPrice) {
    const { long, short } = config;

    const lbalance = parseNumber(long.amountUsdt);
    const sbalance = parseNumber(short.amountBtc); // Se mantiene el balance Short

    // LONG INITIAL CALCULATIONS
    const { coveragePrice: lcoverage, numberOfOrders: lnorder } = calculateLongCoverage(
        lbalance,
        currentPrice,
        parseNumber(long.purchaseUsdt),
        parseNumber(long.price_var) / 100,
        parseNumber(long.size_var) / 100
    );

    // 🛑 Se inicializan los valores Short sin llamar a calculateShortCoverage
    const scoverage = 0; 
    const snorder = 0;

    return {
        lstate: 'BUYING', sstate: 'RUNNING', profit: 0, // Inicia Short en RUNNING (para esperar señal)
        lbalance: lbalance, sbalance: sbalance,
        ltprice: 0, stprice: 0, lcycle: 0, scycle: 0,
        lcoverage: lcoverage, scoverage: scoverage,
        lnorder: lnorder, snorder: snorder,
    };
}

/**
 * Calcula la ganancia o pérdida potencial en USDT si la posición actual se vendiera al precio de mercado.
 * @param {number} ppc - Precio Promedio de Costo (PPC) de la posición.
 * @param {number} ac - Cantidad acumulada de criptomoneda comprada (AC).
 * @param {number} currentPrice - Precio actual de mercado.
 * @param {number} feeRate - Tasa de comisión de BitMart (ej: 0.001 para 0.1%).
 * @returns {number} Ganancia/Pérdida potencial en USDT.
 */
function calculatePotentialProfit(ppc, ac, currentPrice, feeRate) {
    if (ac === 0) {
        return 0; // No hay posición abierta.
    }

    // 1. Costo total de adquisición (USD)
    const totalCostUsdt = ppc * ac;

    // 2. Valor de venta potencial (USD)
    const potentialSaleValueUsdt = currentPrice * ac;

    // 3. Comisión de venta (se aplica sobre el valor de venta)
    const saleFeeUsdt = potentialSaleValueUsdt * feeRate;

    // 4. Ganancia Bruta (antes de comisiones de salida)
    const grossProfit = potentialSaleValueUsdt - totalCostUsdt;
    
    // 5. Ganancia Neta (restamos la comisión de la venta final)
    // Nota: Las comisiones de compra ya están implicitas en el PPC y el totalCost.
    const netPotentialProfit = grossProfit - saleFeeUsdt;

    return netPotentialProfit;
}

module.exports = {
    parseNumber,
    calculateInitialState,
    calculateLongCoverage,
    calculateLongTargets,
    calculatePotentialProfit,    
};