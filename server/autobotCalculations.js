/**
 * BSB/server/autobotCalculations.js
 * Centraliza las matemáticas de Long, Short y cálculos de cobertura.
 * BASADO EN LÓGICA EXPONENCIAL DINÁMICA 2026.
 * ESTÁNDAR: Multiplicadores (Factores) - Sin conversiones de porcentaje ocultas.
 */

const parseNumber = (val) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

/**
 * FUNCIÓN: Distribución de tamaños según Reglas 1-7
 */
function calculateDistributedSizes(totalAmount) {
    const amount = parseNumber(totalAmount);
    if (amount < 42.00) return null;

    let baseSeries = [6.00];
    let sumBase = 6.00;
    
    while (baseSeries.length < 10) {
        let next = baseSeries[baseSeries.length - 1] * 2;
        if (sumBase + next > amount) break;
        baseSeries.push(next);
        sumBase += next;
    }

    let n = baseSeries.length;
    let excedente = amount - sumBase;
    let finalSizes = [...baseSeries];

    if (excedente > 0 && n > 1) {
        let sumWeights = baseSeries.slice(1).reduce((a, b) => a + b, 0);
        let factor = 1 + (excedente / sumWeights);

        for (let i = 1; i < n; i++) {
            finalSizes[i] = baseSeries[i] * factor;
        }
    }

    return finalSizes.map(s => parseFloat(s.toFixed(2)));
}

/**
 * FUNCIÓN: Cálculo de StepGrow mediante Producto Productorio
 */
function calculateStepGrow(levels) {
    const n = parseInt(levels);
    const TARGET_RATIO = 0.82; 
    const START_STEP = 0.015;  

    if (n <= 1) return 1.0;

    let low = 0.1, high = 10.0; 
    
    for (let i = 0; i < 40; i++) {
        let g = (low + high) / 2;
        let cumulativePriceRatio = 1.0;
        
        for (let j = 0; j < n - 1; j++) {
            let step = START_STEP * Math.pow(g, j);
            cumulativePriceRatio *= (1 - step);
        }
        
        if (cumulativePriceRatio > TARGET_RATIO) low = g;
        else high = g;
    }
    
    return parseFloat(((low + high) / 2).toFixed(4));
}

/**
 * LÓGICA DE MONTO EXPONENCIAL (Factor directo)
 */
function getExponentialAmount(baseAmount, orderCount, sizeMultiplier) {
    const base = parseNumber(baseAmount);
    const count = parseNumber(orderCount); 
    const multiplier = parseNumber(sizeMultiplier);

    if (base <= 0) return 0;
    // Cálculo directo: base * (factor ^ count)
    return base * Math.pow(multiplier, count);
}

/**
 * LÓGICA DE DISTANCIA DE PRECIO (Factor directo)
 */
function getExponentialPriceStep(baseGridStep, coverageIndex, gridStepMultiplier = 1.0) {
    const baseStep = parseNumber(baseGridStep);
    const multiplier = parseNumber(gridStepMultiplier);
    // Cálculo directo: base * (multiplier ^ index)
    return baseStep * Math.pow(multiplier, coverageIndex);
}

/**
 * CÁLCULO DE TARGET CON FEES
 */
function calculateTargetWithFees(entryPrice, targetProfitFactor, side = 'long', feeRate = 0.001) {
    const p = parseNumber(entryPrice);
    const profitFactor = parseNumber(targetProfitFactor);
    const totalMarkup = profitFactor + (feeRate * 2);

    return side === 'long' ? p * (1 + totalMarkup) : p * (1 - totalMarkup);
}

// ==========================================
// LÓGICA PARA LONG
// ==========================================

function calculateLongTargets(lastPrice, config, currentOrderCount) {
    const p = parseNumber(lastPrice);
    const gridStep = parseNumber(config?.price_var || 0);
    const gridStepMultiplier = parseNumber(config?.price_step_inc || 1.0);
    const profitFactor = parseNumber(config?.profit_percent || 0); 
    const sizeMultiplier = parseNumber(config?.size_var || 1.0);
    const purchaseUsdt = parseNumber(config?.purchaseUsdt || 0);
    
    const feeRate = 0.001;
    const currentStep = getExponentialPriceStep(gridStep, currentOrderCount, gridStepMultiplier);

    return {
        ltprice: calculateTargetWithFees(p, profitFactor, 'long', feeRate),
        nextCoveragePrice: p * (1 - currentStep),
        requiredCoverageAmount: getExponentialAmount(purchaseUsdt, currentOrderCount, sizeMultiplier)
    };
}

function calculateLongCoverage(balance, referencePrice, baseAmount, gridStep, sizeMultiplier, currentOrderCount, gridStepMultiplier = 1.0) {
    let remainingBalance = parseNumber(balance);
    let orderCount = parseNumber(currentOrderCount);
    let numberOfExtraOrders = 0;
    let coveragePrice = parseNumber(referencePrice); 

    while (numberOfExtraOrders < 50) {
        let nextOrderAmount = getExponentialAmount(baseAmount, orderCount, sizeMultiplier);
        if (remainingBalance < nextOrderAmount) break;
        
        remainingBalance -= nextOrderAmount;
        
        const currentStep = getExponentialPriceStep(gridStep, numberOfExtraOrders, gridStepMultiplier);
        coveragePrice = coveragePrice * (1 - currentStep);
        
        orderCount++;
        numberOfExtraOrders++;
    }

    return { coveragePrice: coveragePrice, numberOfOrders: numberOfExtraOrders };
}

// ==========================================
// LÓGICA PARA SHORT
// ==========================================

function calculateShortTargets(lastPrice, config, currentOrderCount) {
    const p = parseNumber(lastPrice);
    const conf = config || {}; 
    
    const gridStep = parseNumber(conf.price_var || 0);
    const gridStepMultiplier = parseNumber(conf.price_step_inc || 1.0);
    const profitFactor = parseNumber(conf.profit_percent || 0);
    const sizeMultiplier = parseNumber(conf.size_var || 1.0);
    const purchaseUsdt = parseNumber(conf.purchaseUsdt || 0);

    const currentStep = getExponentialPriceStep(gridStep, currentOrderCount, gridStepMultiplier);

    return {
        stprice: calculateTargetWithFees(p, profitFactor, 'short', 0.001),
        nextCoveragePrice: p * (1 + currentStep),
        requiredCoverageAmount: getExponentialAmount(purchaseUsdt, currentOrderCount, sizeMultiplier)
    };
}

function calculateShortCoverage(balance, referencePrice, baseAmount, gridStep, sizeMultiplier, currentOrderCount, gridStepMultiplier = 1.0) {
    let remainingBalance = parseNumber(balance);
    let orderCount = parseNumber(currentOrderCount);
    let numberOfExtraOrders = 0;
    let simulationPrice = parseNumber(referencePrice); 

    while (numberOfExtraOrders < 50) {
        let nextOrderAmount = getExponentialAmount(baseAmount, orderCount, sizeMultiplier);
        if (remainingBalance < nextOrderAmount) break;
        
        remainingBalance -= nextOrderAmount;
        
        const currentStep = getExponentialPriceStep(gridStep, numberOfExtraOrders, gridStepMultiplier);
        simulationPrice = simulationPrice * (1 + currentStep);
        
        orderCount++;
        numberOfExtraOrders++;
    }

    return { coveragePrice: simulationPrice, numberOfOrders: numberOfExtraOrders };
}

// ==========================================
// PNL Y UTILIDADES
// ==========================================

function calculatePotentialProfit(ppc, ac, currentPrice, strategy = 'long', feeRate = 0.001) {
    const p = parseFloat(currentPrice);
    const entry = parseFloat(ppc);
    const qty = parseFloat(ac);
    
    if (!qty || qty <= 0 || !entry || entry <= 0) return 0;

    let grossProfit = 0;
    if (strategy === 'long') {
        grossProfit = (p - entry) * qty;
    } else if (strategy === 'short') {
        grossProfit = (entry - p) * qty;
    } else if (strategy === 'ai') {
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
    calculateTargetWithFees,
    calculateDistributedSizes,
    calculateStepGrow
};