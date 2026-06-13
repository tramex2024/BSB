/**
 * BSB/server/autobotCalculations.js
 * Centraliza las matemáticas de Long, Short y cálculos de cobertura.
 * BASADO EN LÓGICA EXPONENCIAL DINÁMICA 2026.
 * * ATENCIÓN: No modificar operadores matemáticos fundamentales.
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
    const count = parseNumber(orderCount); 
    const sVar = parseNumber(sizeVar);

    if (base <= 0) return 0;
    const multiplier = 1 + (sVar / 100);
    
    return base * Math.pow(multiplier, count);
}

/**
 * LÓGICA DE DISTANCIA DE PRECIO (Price Var Increment)
 */
function getExponentialPriceStep(basePriceVarDec, coverageIndex, priceVarIncrement = 0) {
    const baseStep = parseNumber(basePriceVarDec);
    const increment = 1 + (parseNumber(priceVarIncrement) / 100);
    return baseStep * Math.pow(increment, coverageIndex);
}

/**
 * CÁLCULO DE TARGET CON FEES (Precisión PNL)
 * Asegura que el profit_percent sea NETO tras pagar comisiones.
 */
function calculateTargetWithFees(entryPrice, targetProfitNet, side = 'long', feeRate = 0.001) {
    const p = parseNumber(entryPrice);
    const netProfitDec = parseNumber(targetProfitNet) / 100;
    
    const totalMarkup = netProfitDec + (feeRate * 2);

    return side === 'long' ? p * (1 + totalMarkup) : p * (1 - totalMarkup);
}

// ==========================================
//                LÓGICA PARA LONG
// ==========================================

function calculateLongTargets(lastPrice, config, currentOrderCount) {
    const p = parseNumber(lastPrice);
    const priceVarDec = parseNumber(config?.price_var || 0) / 100;
    const priceVarInc = parseNumber(config?.price_step_inc || 0);
    const profitPercent = parseNumber(config?.profit_percent || 0); 
    const sizeVar = parseNumber(config?.size_var || 0);
    const purchaseUsdt = parseNumber(config?.purchaseUsdt || 0);
    
    const feeRate = 0.001;
    const currentStep = getExponentialPriceStep(priceVarDec, currentOrderCount, priceVarInc);

    return {
        ltprice: calculateTargetWithFees(p, profitPercent, 'long', feeRate),
        nextCoveragePrice: p * (1 - currentStep),
        requiredCoverageAmount: getExponentialAmount(purchaseUsdt, currentOrderCount, sizeVar)
    };
}

function calculateLongCoverage(balance, referencePrice, baseAmount, priceVarDec, sizeVar, currentOrderCount, priceVarIncrement = 0) {
    let remainingBalance = parseNumber(balance);
    let orderCount = parseNumber(currentOrderCount);
    let numberOfExtraOrders = 0;
    let coveragePrice = parseNumber(referencePrice); 

    while (numberOfExtraOrders < 50) {
        let nextOrderAmount = getExponentialAmount(baseAmount, orderCount, sizeVar);
        if (remainingBalance < nextOrderAmount) break;
        
        remainingBalance -= nextOrderAmount;
        
        // CORRECCIÓN: El paso de precio debe calcularse usando el índice relativo (numberOfExtraOrders)
        // para que no arrastre el desfase del nivel actual ejecutado en el exchange.
        const currentStep = getExponentialPriceStep(priceVarDec, numberOfExtraOrders, priceVarIncrement);
        coveragePrice = coveragePrice * (1 - currentStep);
        
        orderCount++;
        numberOfExtraOrders++;
    }

    return { coveragePrice: coveragePrice, numberOfOrders: numberOfExtraOrders };
}

// ==========================================
//                LÓGICA PARA SHORT
// ==========================================

function calculateShortTargets(lastPrice, config, currentOrderCount) {
    const p = parseNumber(lastPrice);
    const conf = config || {}; 
    
    const priceVarDec = parseNumber(conf.price_var) / 100;
    const priceVarInc = parseNumber(conf.price_step_inc || 0);
    const profitPercent = parseNumber(conf.profit_percent || 0);
    const sizeVar = parseNumber(conf.size_var || 0);
    const purchaseUsdt = parseNumber(conf.purchaseUsdt || 0);

    const currentStep = getExponentialPriceStep(priceVarDec, currentOrderCount, priceVarInc);

    return {
        stprice: calculateTargetWithFees(p, profitPercent, 'short', 0.001),
        nextCoveragePrice: p * (1 + currentStep),
        requiredCoverageAmount: getExponentialAmount(purchaseUsdt, currentOrderCount, sizeVar)
    };
}

/**
 * Calcula la cobertura Short de forma PROYECTIVA y ANCLADA.
 * CORREGIDA: Sincroniza los pasos del acordeón con las órdenes restantes reales.
 */
function calculateShortCoverage(balance, referencePrice, baseAmount, priceVarDec, sizeVar, currentOrderCount, priceVarIncrement = 0) {
    let remainingBalance = parseNumber(balance);
    let orderCount = parseNumber(currentOrderCount);
    let numberOfExtraOrders = 0;
    let simulationPrice = parseNumber(referencePrice); 

    while (numberOfExtraOrders < 50) {
        let nextOrderAmount = getExponentialAmount(baseAmount, orderCount, sizeVar);
        if (remainingBalance < nextOrderAmount) break;
        
        remainingBalance -= nextOrderAmount;
        
        // CORRECCIÓN: Usamos numberOfExtraOrders para mantener la simulación
        // alineada con el paso correspondiente del Step original.
        const currentStep = getExponentialPriceStep(priceVarDec, numberOfExtraOrders, priceVarIncrement);
        simulationPrice = simulationPrice * (1 + currentStep);
        
        orderCount++;
        numberOfExtraOrders++;
    }

    return { coveragePrice: simulationPrice, numberOfOrders: numberOfExtraOrders };
}

// ==========================================
//                PNL Y UTILIDADES
// ==========================================

function calculatePotentialProfit(ppc, ac, currentPrice, strategy = 'long', feeRate = 0.001) {
    const p = parseFloat(currentPrice);
    const entry = parseFloat(ppc);
    const qty = parseFloat(ac);
    
    if (!qty || qty <= 0 || !entry || entry <= 0) return 0;

    // LÓGICA DIFERENCIADA POR ESTRATEGIA
    let grossProfit = 0;
    if (strategy === 'long') {
        grossProfit = (p - entry) * qty;
    } else if (strategy === 'short') {
        grossProfit = (entry - p) * qty;
    } else if (strategy === 'ai') {
        // Asumiendo que AI es Long por defecto. 
        // Si tu IA es dinámica, ajusta la lógica aquí.
        grossProfit = (p - entry) * qty; 
    }
    
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