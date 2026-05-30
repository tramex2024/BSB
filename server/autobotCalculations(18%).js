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

/**
 * Calcula la cobertura de la malla Long con las nuevas reglas:
 * 1. Cobertura total del 18%
 * 2. Multiplicador dinámico (1.9x a 2.1x)
 * 3. Adaptación automática al capital disponible
 */
function calculateLongCoverage(totalBalance, currentPrice, purchaseFixed, priceVar, sizeVar, currentOcc, stepInc) {
    const ABRANGE_TARGET = 0.18; // 18% fijo
    const MAX_LEVELS = 8;
    
    let n = 0;
    let cumulativeBase = 0;
    let orderBase = purchaseFixed;
    let currentMultiplier = 1.9; // Empezamos en 1.9x

    // 1. DETERMINAR CUÁNTOS NIVELES PODEMOS CUBRIR CON EL BALANCE
    while (cumulativeBase + orderBase <= totalBalance && n < MAX_LEVELS) {
        cumulativeBase += orderBase;
        n++;
        
        // Aumentamos el multiplicador: 1.9 -> 1.95 -> 2.0 -> 2.05 -> 2.1
        currentMultiplier = Math.min(1.9 + (n * 0.05), 2.1);
        orderBase *= currentMultiplier;
    }

    // 2. CÁLCULO DEL PRECIO DE COBERTURA (DÓNDE TERMINA TU MALLA)
    // El motor calcula qué tan lejos cae el precio según el 'step'
    // Con un target del 18%, el precio de cobertura es simplemente el 82% del inicial
    const coveragePrice = currentPrice * (1 - ABRANGE_TARGET);

    return {
        coveragePrice: parseFloat(coveragePrice.toFixed(2)),
        numberOfOrders: n,
        totalUsed: parseFloat(cumulativeBase.toFixed(2))
    };
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

    let grossProfit = (strategy === 'long') 
        ? (p - entry) * qty 
        : (entry - p) * qty;
    
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