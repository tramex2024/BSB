/**
 * BSB/server/autobotCalculations.js
 * Centraliza las matemáticas de Long, Short y cálculos de cobertura.
 * BASADO EN LÓGICA EXPONENCIAL DINÁMICA 2026.
 */

const parseNumber = (val) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

/**
 * LÓGICA DE MONTO EXPONENCIAL
 * Formula: $Amount = Base \times (1 + \frac{sizeVar}{100})^{orderCount}$
 */
function getExponentialAmount(baseAmount, orderCount, sizeVar) {
    const base = parseNumber(baseAmount);
    const count = parseNumber(orderCount);
    const sVar = parseNumber(sizeVar);

    if (base <= 0) return 0;
    const multiplier = 1 + (sVar / 100);
    
    // Si count es 0 (orden inicial), devuelve el baseAmount puro.
    return base * Math.pow(multiplier, count);
}

/**
 * LÓGICA DE DISTANCIA DE PRECIO (Price Var Increment)
 * Permite que cada cobertura esté un % más lejos que la anterior.
 */
function getExponentialPriceStep(basePriceVarDec, coverageIndex, priceVarIncrement = 0) {
    const baseStep = parseNumber(basePriceVarDec);
    const increment = 1 + (parseNumber(priceVarIncrement) / 100);
    // coverageIndex 0 es la primera cobertura (distancia base)
    return baseStep * Math.pow(increment, coverageIndex);
}

/**
 * CÁLCULO DE TARGET CON FEES (Precisión PNL)
 * Asegura que el profit_percent sea NETO tras pagar comisiones de entrada y salida.
 */
function calculateTargetWithFees(entryPrice, targetProfitNet, side = 'long', feeRate = 0.001) {
    const p = parseNumber(entryPrice);
    const netProfitDec = parseNumber(targetProfitNet) / 100;
    
    // El precio debe cubrir el profit deseado + la comisión de entrada + la de salida
    const totalMarkup = netProfitDec + (feeRate * 2);

    if (side === 'long') {
        return p * (1 + totalMarkup);
    } else {
        return p * (1 - totalMarkup);
    }
}

// ==========================================
//            LÓGICA PARA LONG
// ==========================================

function calculateLongTargets(lastPrice, config, orderCount) {
    const p = parseNumber(lastPrice);
    const priceVarDec = parseNumber(config.price_var) / 100;
    const feeRate = 0.001;

    return {
        targetSellPrice: calculateTargetWithFees(p, config.trigger, 'long', feeRate),
        nextCoveragePrice: p * (1 - priceVarDec),
        requiredCoverageAmount: getExponentialAmount(config.purchaseUsdt, orderCount, config.size_var)
    };
}

function calculateLongCoverage(balance, currentMarketPrice, baseAmount, priceVarDec, sizeVar, currentOrderCount, priceVarIncrement = 0) {
    let remainingBalance = parseNumber(balance);
    let simulationPrice = parseNumber(currentMarketPrice); 
    let orderCount = parseNumber(currentOrderCount);
    let numberOfExtraOrders = 0;

    // Límite de seguridad de 50 órdenes para evitar bucles infinitos
    while (numberOfExtraOrders < 50) {
        let nextOrderAmount = getExponentialAmount(baseAmount, orderCount, sizeVar);

        if (remainingBalance < nextOrderAmount) break;

        remainingBalance -= nextOrderAmount;
        
        const currentStep = getExponentialPriceStep(priceVarDec, numberOfExtraOrders, priceVarIncrement);
        simulationPrice = simulationPrice * (1 - currentStep);

        orderCount++;
        numberOfExtraOrders++;
    }

    return { 
        coveragePrice: simulationPrice, 
        numberOfOrders: numberOfExtraOrders 
    };
}

// ==========================================
//            LÓGICA PARA SHORT
// ==========================================

function calculateShortTargets(lastPrice, config, orderCount) {
    const p = parseNumber(lastPrice);
    const pVarDec = parseNumber(config.price_var) / 100;
    const feeRate = 0.001;

    return {
        targetBuyPrice: calculateTargetWithFees(p, config.trigger, 'short', feeRate),
        nextCoveragePrice: p * (1 + pVarDec), 
        requiredCoverageAmount: getExponentialAmount(config.purchaseUsdt, orderCount, config.size_var)
    };
}

function calculateShortCoverage(balance, currentMarketPrice, baseAmount, priceVarDec, sizeVar, currentOrderCount, priceVarIncrement = 0) {
    let remainingBalance = parseNumber(balance);
    let simulationPrice = parseNumber(currentMarketPrice); 
    let orderCount = parseNumber(currentOrderCount);
    let numberOfExtraOrders = 0;

    while (numberOfExtraOrders < 50) {
        let nextOrderAmount = getExponentialAmount(baseAmount, orderCount, sizeVar);

        if (remainingBalance < nextOrderAmount) break;

        remainingBalance -= nextOrderAmount;
        
        const currentStep = getExponentialPriceStep(priceVarDec, numberOfExtraOrders, priceVarIncrement);
        simulationPrice = simulationPrice * (1 + currentStep);

        orderCount++;
        numberOfExtraOrders++;
    }

    return { 
        coveragePrice: simulationPrice, 
        numberOfOrders: numberOfExtraOrders 
    };
}

// ==========================================
//            PNL Y UTILIDADES
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
    const feeRate = 0.001;

    return {
        long: calculateLongTargets(p, config.long, 1),
        short: calculateShortTargets(p, config.short, 1)
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
    getExponentialAmount,
    calculateTargetWithFees
};