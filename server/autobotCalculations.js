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
 * $Amount = Base \times (1 + \frac{sizeVar}{100})^{orderCount}$
 */
function getExponentialAmount(baseAmount, orderCount, sizeVar) {
    const base = parseNumber(baseAmount);
    const count = parseNumber(orderCount); // n-ésima cobertura
    const sVar = parseNumber(sizeVar);

    if (base <= 0) return 0;
    const multiplier = 1 + (sVar / 100);
    
    // Si count es 0 (primera orden), devuelve base. 
    // Si es 1, ya aplica la primera expansión exponencial.
    return base * Math.pow(multiplier, count);
}

/**
 * LÓGICA DE DISTANCIA DE PRECIO (Price Var Increment)
 * Multiplica la distancia base por el incremento exponencial según el índice de cobertura.
 */
function getExponentialPriceStep(basePriceVarDec, coverageIndex, priceVarIncrement = 0) {
    const baseStep = parseNumber(basePriceVarDec);
    const increment = 1 + (parseNumber(priceVarIncrement) / 100);
    // coverageIndex 0 es el primer DCA (la distancia inicial definida en price_var)
    return baseStep * Math.pow(increment, coverageIndex);
}

/**
 * CÁLCULO DE TARGET CON FEES (Precisión PNL)
 * Asegura que el profit_percent sea NETO tras pagar comisiones.
 */
function calculateTargetWithFees(entryPrice, targetProfitNet, side = 'long', feeRate = 0.001) {
    const p = parseNumber(entryPrice);
    const netProfitDec = parseNumber(targetProfitNet) / 100;
    
    // Markup = Profit deseado + Comisiones (Entrada + Salida)
    const totalMarkup = netProfitDec + (feeRate * 2);

    return side === 'long' ? p * (1 + totalMarkup) : p * (1 - totalMarkup);
}

// ==========================================
//            LÓGICA PARA LONG
// ==========================================

function calculateLongTargets(lastPrice, config, currentOrderCount) {
    const p = parseNumber(lastPrice);
    const priceVarDec = parseNumber(config.price_var) / 100;
    const priceVarInc = parseNumber(config.price_step_inc || 0);
    const feeRate = 0.001;

    // Calculamos el paso de precio actual basado en cuántas órdenes ya lleva
    const currentStep = getExponentialPriceStep(priceVarDec, currentOrderCount - 1, priceVarInc);

    return {
        targetSellPrice: calculateTargetWithFees(p, config.trigger, 'long', feeRate),
        nextCoveragePrice: p * (1 - currentStep),
        requiredCoverageAmount: getExponentialAmount(config.purchaseUsdt, currentOrderCount, config.size_var)
    };
}

// 

function calculateLongCoverage(balance, currentMarketPrice, baseAmount, priceVarDec, sizeVar, currentOrderCount, priceVarIncrement = 0) {
    let remainingBalance = parseNumber(balance);
    let simulationPrice = parseNumber(currentMarketPrice); 
    let orderCount = parseNumber(currentOrderCount);
    let numberOfExtraOrders = 0;

    // Simulación de "Survival": Cuántos golpes aguanta el balance
    while (numberOfExtraOrders < 50) {
        let nextOrderAmount = getExponentialAmount(baseAmount, orderCount, sizeVar);

        if (remainingBalance < nextOrderAmount) break;

        remainingBalance -= nextOrderAmount;
        
        // La distancia al suelo aumenta en cada paso si priceVarIncrement > 0
        const currentStep = getExponentialPriceStep(priceVarDec, orderCount - 1, priceVarIncrement);
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

function calculateShortTargets(lastPrice, config, currentOrderCount) {
    const p = parseNumber(lastPrice);
    const pVarDec = parseNumber(config.price_var) / 100;
    const priceVarInc = parseNumber(config.price_step_inc || 0);
    const feeRate = 0.001;

    const currentStep = getExponentialPriceStep(pVarDec, currentOrderCount - 1, priceVarInc);

    return {
        targetBuyPrice: calculateTargetWithFees(p, config.trigger, 'short', feeRate),
        nextCoveragePrice: p * (1 + currentStep), 
        requiredCoverageAmount: getExponentialAmount(config.purchaseUsdt, currentOrderCount, config.size_var)
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
        
        const currentStep = getExponentialPriceStep(priceVarDec, orderCount - 1, priceVarIncrement);
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

    // Profit Bruto
    let grossProfit = (strategy === 'long') 
        ? (p - entry) * qty 
        : (entry - p) * qty;
    
    // Comisiones: Se cobran sobre el valor nominal de la operación (Entrada + Salida estimada)
    const entryValue = entry * qty;
    const exitValue = p * qty;
    const totalFees = (entryValue + exitValue) * feeRate;

    return grossProfit - totalFees;
}

module.exports = {
    parseNumber,
    calculateLongTargets,
    calculateLongCoverage,
    calculateShortTargets,
    calculateShortCoverage,
    calculatePotentialProfit,
    getExponentialAmount,
    calculateTargetWithFees
};