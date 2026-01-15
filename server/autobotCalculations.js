/**
 * BSB/server/autobotCalculations.js
 * Centraliza las matemáticas de Long, Short y cálculos de cobertura.
 * BASADO EN LÓGICA EXPONENCIAL DINÁMICA.
 */

const parseNumber = (val) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

/**
 * LÓGICA EXPONENCIAL DINÁMICA
 * multiplier = 1 + (sizeVar / 100) -> 100% es 2 (doblar)
 */
function getExponentialAmount(baseAmount, orderCount, sizeVar) {
    const base = parseNumber(baseAmount);
    const count = parseNumber(orderCount);
    const sVar = parseNumber(sizeVar || 100); // Default 100% (x2) si no viene valor

    const multiplier = 1 + (sVar / 100);

    if (base <= 0) return 0;
    // Si el multiplicador es 1 (0% de aumento), devolvemos la base plana
    if (multiplier <= 1) return base;

    return base * Math.pow(multiplier, count);
}

// ==========================================
//          LÓGICA PARA LONG (COMPRA)
// ==========================================

function calculateLongTargets(lastPrice, profit_percent, price_var, size_var, orderCount, baseAmount) {
    const p = parseNumber(lastPrice);
    const priceVarDec = parseNumber(price_var) / 100;
    const profitDec = parseNumber(profit_percent) / 100;

    return {
        targetSellPrice: p * (1 + profitDec),
        nextCoveragePrice: p * (1 - priceVarDec),
        requiredCoverageAmount: getExponentialAmount(baseAmount, orderCount, size_var)
    };
}

function calculateLongCoverage(balance, lastPrice, baseAmount, priceVarDec, sizeVar, currentOrderCount) {
    let remainingBalance = parseNumber(balance);
    let currentPriceLevel = parseNumber(lastPrice);
    let orderCount = parseNumber(currentOrderCount);
    let numberOfExtraOrders = 0;

    if (baseAmount <= 0 || remainingBalance <= 0) return { coveragePrice: currentPriceLevel, numberOfOrders: 0 };

    // Limitamos a 20 para evitar bucles infinitos por error de datos
    while (numberOfExtraOrders < 20) {
        let nextAmount = getExponentialAmount(baseAmount, orderCount, sizeVar);
        if (nextAmount <= 0 || remainingBalance < nextAmount) break;

        remainingBalance -= nextAmount;
        currentPriceLevel = currentPriceLevel * (1 - parseNumber(priceVarDec));
        orderCount++;
        numberOfExtraOrders++;
    }

    return { 
        coveragePrice: currentPriceLevel, 
        numberOfOrders: numberOfExtraOrders 
    };
}

// ==========================================
//          LÓGICA PARA SHORT (VENTA)
// ==========================================

function calculateShortTargets(lastPrice, profit_percent, price_var, size_var, baseAmount, orderCount) {
    const p = parseNumber(lastPrice);
    const pVar = parseNumber(price_var) / 100;
    const profitDec = parseNumber(profit_percent) / 100;

    return {
        targetBuyPrice: p * (1 - profitDec),
        nextCoveragePrice: p * (1 + pVar), 
        requiredCoverageAmount: getExponentialAmount(baseAmount, orderCount, size_var)
    };
}

/**
 * LÓGICA CORRECTA: SCoverage es la proyección de resistencia desde el precio actual.
 */
function calculateShortCoverage(balance, currentPrice, baseAmount, priceVarDec, sizeVar, currentOrderCount) {
    let remainingBalance = parseNumber(balance);
    let simulationPrice = parseNumber(currentPrice); // Empezamos desde el precio real de mercado
    let orderCount = parseNumber(currentOrderCount);
    let numberOfExtraOrders = 0;

    // Usamos un bucle para ver cuántas órdenes "caben" en el balance
    while (numberOfExtraOrders < 20) {
        // Calculamos cuánto costaría la SIGUIENTE orden exponencial
        let nextOrderAmount = getExponentialAmount(baseAmount, orderCount, sizeVar);

        // Si no tenemos dinero para esta orden, la cobertura se queda en el precio de la anterior
        if (remainingBalance < nextOrderAmount) break;

        // Si hay dinero: lo restamos, subimos el precio de simulación y aumentamos el contador
        remainingBalance -= nextOrderAmount;
        
        // En la primera iteración, el precio es el actual. 
        // En las siguientes, el precio va subiendo según el priceVarDec.
        if (numberOfExtraOrders > 0) {
            simulationPrice = simulationPrice * (1 + parseNumber(priceVarDec));
        }

        orderCount++;
        numberOfExtraOrders++;
    }

    return { 
        coveragePrice: simulationPrice, // Este es tu SCoverage real
        numberOfOrders: numberOfExtraOrders 
    };
}

// ==========================================
//          PNL Y UTILIDADES
// ==========================================

function calculatePotentialProfit(ppc, ac, currentPrice, strategy = 'long', feeRate = 0.001) {
    const p = parseFloat(currentPrice);
    const entry = parseFloat(ppc);
    const qty = parseFloat(ac);
    
    if (!qty || qty <= 0 || !entry || entry <= 0) return 0;

    let grossProfit = (strategy === 'long') 
        ? (p - entry) * qty 
        : (entry - p) * qty;
    
    const entryValue = entry * qty;
    const exitValue = p * qty;
    const totalFees = (entryValue + exitValue) * feeRate;

    return grossProfit - totalFees;
}

function calculateInitialState(config, currentPrice) {
    const p = parseNumber(currentPrice);
    const lBase = parseNumber(config.long?.purchaseUsdt || 0);
    const sBase = parseNumber(config.short?.purchaseUsdt || 0);
    const lSizeVar = parseNumber(config.long?.size_var || 100);
    const sSizeVar = parseNumber(config.short?.size_var || 100);

    return {
        long: {
            nextCoveragePrice: p * (1 - (parseNumber(config.long?.price_var || 0) / 100)),
            requiredCoverageAmount: getExponentialAmount(lBase, 1, lSizeVar)
        },
        short: {
            nextCoveragePrice: p * (1 + (parseNumber(config.short?.price_var || 0) / 100)),
            requiredCoverageAmount: getExponentialAmount(sBase, 1, sSizeVar)
        }
    };
}

module.exports = {
    parseNumber,
    calculateLongTargets,
    calculateLongCoverage,
    calculateShortTargets,
    calculateShortCoverage,
    calculatePotentialProfit,
    calculateInitialState,
    getExponentialAmount
};