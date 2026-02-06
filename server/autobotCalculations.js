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
 * Formula: Amount = Base * (1 + sizeVar/100)^orderCount
 */
function getExponentialAmount(baseAmount, orderCount, sizeVar) {
    const base = parseNumber(baseAmount);
    const count = parseNumber(orderCount);
    const sVar = parseNumber(sizeVar || 100);

    const multiplier = 1 + (sVar / 100);

    if (base <= 0) return 0;
    // Si count es 0 (orden inicial), devuelve el baseAmount puro.
    return base * Math.pow(multiplier, count);
}

/**
 * LÓGICA DE DISTANCIA DE PRECIO (Price Var Dec)
 * Permite que cada cobertura esté un % más lejos que la anterior si se desea.
 */
function getExponentialPriceStep(basePriceVarDec, coverageIndex, priceVarIncrement = 0) {
    const baseStep = parseNumber(basePriceVarDec);
    const increment = 1 + (parseNumber(priceVarIncrement) / 100);
    // coverageIndex 0 es la primera cobertura (distancia base)
    return baseStep * Math.pow(increment, coverageIndex);
}

/**
 * CÁLCULO DE TARGET CON FEES (Precisión PNL)
 * Calcula el precio de salida necesario para obtener un beneficio NETO real.
 */
function calculateTargetWithFees(entryPrice, targetProfitNet, side = 'long', feeRate = 0.001) {
    const p = parseNumber(entryPrice);
    const netProfitDec = parseNumber(targetProfitNet) / 100;
    
    // El precio debe cubrir el profit deseado + la comisión de entrada + la de salida
    // Factor simplificado: (1 + %Profit + %FeeEntrada + %FeeSalida)
    const totalMarkup = netProfitDec + (feeRate * 2);

    if (side === 'long') {
        return p * (1 + totalMarkup);
    } else {
        return p * (1 - totalMarkup);
    }
}

// ==========================================
//           LÓGICA PARA LONG (COMPRA)
// ==========================================

function calculateLongTargets(lastPrice, profit_percent, price_var, size_var, orderCount, baseAmount) {
    const p = parseNumber(lastPrice);
    const priceVarDec = parseNumber(price_var) / 100;
    const feeRate = 0.001; // Standard Bitmart fee

    return {
        targetSellPrice: calculateTargetWithFees(p, profit_percent, 'long', feeRate),
        nextCoveragePrice: p * (1 - priceVarDec),
        requiredCoverageAmount: getExponentialAmount(baseAmount, orderCount, size_var)
    };
}

function calculateLongCoverage(balance, currentMarketPrice, baseAmount, priceVarDec, sizeVar, currentOrderCount, priceVarIncrement = 0) {
    let remainingBalance = parseNumber(balance);
    let simulationPrice = parseNumber(currentMarketPrice); 
    let orderCount = parseNumber(currentOrderCount);
    let numberOfExtraOrders = 0;

    while (numberOfExtraOrders < 30) {
        let nextOrderAmount = getExponentialAmount(baseAmount, orderCount, sizeVar);

        if (remainingBalance < nextOrderAmount) break;

        remainingBalance -= nextOrderAmount;
        
        // Aplicamos el paso de precio exponencial para la simulación
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
//           LÓGICA PARA SHORT (VENTA)
// ==========================================

function calculateShortTargets(lastPrice, profit_percent, price_var, size_var, orderCount, baseAmount) {
    const p = parseNumber(lastPrice);
    const pVarDec = parseNumber(price_var) / 100;
    const feeRate = 0.001;

    return {
        targetBuyPrice: calculateTargetWithFees(p, profit_percent, 'short', feeRate),
        nextCoveragePrice: p * (1 + pVarDec), 
        requiredCoverageAmount: getExponentialAmount(baseAmount, orderCount, size_var)
    };
}

function calculateShortCoverage(balance, currentMarketPrice, baseAmount, priceVarDec, sizeVar, currentOrderCount, priceVarIncrement = 0) {
    let remainingBalance = parseNumber(balance);
    let simulationPrice = parseNumber(currentMarketPrice); 
    let orderCount = parseNumber(currentOrderCount);
    let numberOfExtraOrders = 0;

    while (numberOfExtraOrders < 30) {
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
//           PNL Y UTILIDADES
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
    const feeRate = 0.001;

    return {
        long: {
            targetSellPrice: calculateTargetWithFees(p, config.long?.trigger, 'long', feeRate),
            nextCoveragePrice: p * (1 - (parseNumber(config.long?.price_var || 0) / 100)),
            requiredCoverageAmount: getExponentialAmount(lBase, 1, lSizeVar)
        },
        short: {
            targetBuyPrice: calculateTargetWithFees(p, config.short?.trigger, 'short', feeRate),
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
    getExponentialAmount,
    calculateTargetWithFees
};