/**
 * BSB/server/autobotCalculations.js
 * Centraliza las matemáticas de Long, Short y cálculos de cobertura.
 * BASADO EN LÓGICA EXPONENCIAL PURA (2^n).
 */

const parseNumber = (val) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

/**
 * LÓGICA EXPONENCIAL (2^n)
 * @param {number} baseAmount - El monto de la primera compra (purchaseUsdt)
 * @param {number} orderCount - Número de órdenes YA ejecutadas en el ciclo
 * @returns {number} Monto para la SIGUIENTE orden
 */
function getExponentialAmount(baseAmount, orderCount) {
    const base = parseNumber(baseAmount);
    const count = parseNumber(orderCount);
    // Si ya hay 1 orden (la inicial), la siguiente (2da) es: base * 2^1 = 12
    // Si ya hay 2 órdenes, la siguiente (3ra) es: base * 2^2 = 24
    return base * Math.pow(2, count);
}

// ==========================================
//          LÓGICA PARA LONG (COMPRA)
// ==========================================

/**
 * Calcula los objetivos de la SIGUIENTE orden basándose en la última ejecutada.
 */
function calculateLongTargets(lastPrice, profit_percent, price_var, orderCount, baseAmount) {
    const p = parseNumber(lastPrice);
    const priceVarDec = parseNumber(price_var) / 100;

    return {
        // Precio al que se disparará la siguiente cobertura
        nextCoveragePrice: p * (1 - priceVarDec),
        
        // Monto exponencial para la siguiente cobertura
        requiredCoverageAmount: getExponentialAmount(baseAmount, orderCount)
    };
}

/**
 * Simulación de resistencia (Hasta dónde aguanta el balance)
 */
function calculateLongCoverage(balance, lastPrice, baseAmount, priceVarDec, currentOrderCount) {
    let remainingBalance = parseNumber(balance);
    let currentPriceLevel = parseNumber(lastPrice);
    let orderCount = parseNumber(currentOrderCount);
    let numberOfExtraOrders = 0;

    while (true) {
        let nextAmount = getExponentialAmount(baseAmount, orderCount);
        if (remainingBalance < nextAmount || numberOfExtraOrders > 20) break;

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

function calculateShortTargets(lastPrice, profit_percent, price_var, orderCount, baseAmount) {
    const p = parseNumber(lastPrice);
    const priceVarDec = parseNumber(price_var) / 100;

    return {
        nextCoveragePrice: p * (1 + priceVarDec), 
        requiredCoverageAmount: getExponentialAmount(baseAmount, orderCount)
    };
}

// ==========================================
//          PNL Y UTILIDADES
// ==========================================

/**
 * PNL Flotante (Unrealized PNL)
 */
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

/**
 * Inicializa los valores de la estrategia al dar START
 */
function calculateInitialState(config, currentPrice) {
    const p = parseNumber(currentPrice);
    
    // Usamos purchaseUsdt como base de la pirámide exponencial
    const lBase = parseNumber(config.long?.purchaseUsdt || 0);
    const sBase = parseNumber(config.short?.purchaseUsdt || 0);

    return {
        long: {
            nextCoveragePrice: p * (1 - (parseNumber(config.long?.price_var || 0) / 100)),
            requiredCoverageAmount: lBase * 2 // Proyecta la 2da orden
        },
        short: {
            nextCoveragePrice: p * (1 + (parseNumber(config.short?.price_var || 0) / 100)),
            requiredCoverageAmount: sBase * 2
        }
    };
}

/**
 * Simulación de resistencia para SHORT (Hasta dónde aguanta el balance si el precio sube)
 * Basado en Lógica Exponencial 2^n
 */
function calculateShortCoverage(balance, lastPrice, baseAmount, priceVarDec, currentOrderCount) {
    let remainingBalance = parseNumber(balance);
    let currentPriceLevel = parseNumber(lastPrice);
    let orderCount = parseNumber(currentOrderCount);
    let numberOfExtraOrders = 0;

    while (true) {
        // Usamos la misma lógica exponencial que el Long
        let nextAmount = getExponentialAmount(baseAmount, orderCount);
        if (remainingBalance < nextAmount || numberOfExtraOrders > 20) break;

        remainingBalance -= nextAmount;
        // En Short, el riesgo es que el precio SUBE
        currentPriceLevel = currentPriceLevel * (1 + parseNumber(priceVarDec));
        orderCount++;
        numberOfExtraOrders++;
    }

    return { 
        coveragePrice: currentPriceLevel, 
        numberOfOrders: numberOfExtraOrders 
    };
}

module.exports = {
    parseNumber,
    calculateLongTargets,
    calculateLongCoverage,
    calculateShortTargets, // Asegúrate de que esta use getExponentialAmount
    calculateShortCoverage, // <--- ESTA ES LA QUE FALTABA
    calculatePotentialProfit,
    calculateInitialState,
    getExponentialAmount
};