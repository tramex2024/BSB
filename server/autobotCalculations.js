/**
 * BSB/server/autobotCalculations.js
 * Centraliza las matemáticas de Long, Short y cálculos de cobertura.
 */

/**
 * BSB/server/autobotCalculations.js
 * Centraliza las matemáticas de Long, Short y cálculos de cobertura.
 */

const parseNumber = (val) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

// ==========================================
//        LÓGICA PARA LONG (COMPRA)
// ==========================================

function calculateLongTargets(ppc, profit_percent, price_var, size_var, purchaseUsdt, currentOrderCount, balance) {
    const profitDec = parseNumber(profit_percent) / 100;
    const priceVarDec = parseNumber(price_var) / 100;
    const sizeVarDec = parseNumber(size_var) / 100;

    // Cantidad requerida para la PRÓXIMA orden (Martingala)
    const requiredAmount = parseNumber(purchaseUsdt) * Math.pow(1 + sizeVarDec, currentOrderCount);

    return {
        takeProfitPrice: ppc * (1 + profitDec),
        nextCoveragePrice: ppc * (1 - priceVarDec),
        requiredCoverageAmount: requiredAmount
    };
}

function calculateLongCoverage(balance, basePrice, initialAmount, priceVarDec, sizeVarDec, currentOrderCount = 0) {
    let remainingBalance = parseNumber(balance);
    let nextPrice = parseNumber(basePrice);
    let nextAmount = parseNumber(initialAmount) * Math.pow(1 + sizeVarDec, currentOrderCount);
    let numberOfOrders = 0;

    while (remainingBalance >= nextAmount && numberOfOrders < 50) {
        remainingBalance -= nextAmount;
        nextPrice = nextPrice * (1 - priceVarDec);
        nextAmount = nextAmount * (1 + sizeVarDec);
        numberOfOrders++;
    }

    return { 
        coveragePrice: nextPrice, 
        numberOfOrders: numberOfOrders 
    };
}

// ==========================================
//        LÓGICA PARA SHORT (VENTA)
// ==========================================

function calculateShortTargets(ppc, profit_percent, price_var, size_var, purchaseUsdt, currentOrderCount, balance) {
    const profitDec = parseNumber(profit_percent) / 100;
    const priceVarDec = parseNumber(price_var) / 100;
    const sizeVarDec = parseNumber(size_var) / 100;

    const requiredAmount = parseNumber(purchaseUsdt) * Math.pow(1 + sizeVarDec, currentOrderCount);

    return {
        takeProfitPrice: ppc * (1 - profitDec), // Profit hacia abajo
        nextCoveragePrice: ppc * (1 + priceVarDec), // Cobertura hacia arriba
        requiredCoverageAmount: requiredAmount
    };
}

function calculateShortCoverage(balance, basePrice, initialAmount, priceVarDec, sizeVarDec, currentOrderCount = 0) {
    let remainingBalance = parseNumber(balance);
    let nextPrice = parseNumber(basePrice);
    let nextAmount = parseNumber(initialAmount) * Math.pow(1 + sizeVarDec, currentOrderCount);
    let numberOfOrders = 0;

    while (remainingBalance >= nextAmount && numberOfOrders < 50) {
        remainingBalance -= nextAmount;
        nextPrice = nextPrice * (1 + priceVarDec); // El peligro está en la subida
        nextAmount = nextAmount * (1 + sizeVarDec);
        numberOfOrders++;
    }

    return { 
        coveragePrice: nextPrice, 
        numberOfOrders: numberOfOrders 
    };
}

// ==========================================
//        INICIALIZACIÓN Y UTILIDADES
// ==========================================

function calculateInitialState(config, currentPrice) {
    const l_purchase = parseNumber(config.long.purchaseUsdt);
    const s_purchase = parseNumber(config.short.purchaseUsdt);
    const l_pvar = parseNumber(config.long.price_var) / 100;
    const s_pvar = parseNumber(config.short.price_var) / 100;

    return {
        lbalance: l_purchase,
        sbalance: s_purchase,
        lcoverage: currentPrice * (1 - l_pvar),
        scoverage: currentPrice * (1 + s_pvar),
        lnorder: 1,
        snorder: 1
    };
}

/**
 * Calcula la ganancia o pérdida flotante en tiempo real.
 * @param {number} currentPrice - Precio actual de mercado.
 * @param {number} ppc - Precio promedio de compra/venta.
 * @param {number} ac - Cantidad acumulada de activos.
 * @param {string} strategy - 'long' o 'short'.
 */
function calculatePotentialProfit(ppc, ac, currentPrice, feeRate = 0.001) {
    const p = parseFloat(currentPrice);
    const entry = parseFloat(ppc);
    const qty = parseFloat(ac);
    
    if (!qty || qty <= 0 || !entry || entry <= 0) return 0;

    // Beneficio bruto (Long)
    const grossProfit = (p - entry) * qty;
    
    // Estimación de comisión (entrada + salida)
    const fees = (entry * qty * feeRate) + (p * qty * feeRate);

    return grossProfit - fees;
}

module.exports = {
    parseNumber,
    calculateLongTargets,
    calculateLongCoverage,
    calculateShortTargets,
    calculateShortCoverage,
    calculateInitialState,
    calculatePotentialProfit
};