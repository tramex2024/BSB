/**
 * BSB/server/autobotCalculations.js
 * Centraliza las matemáticas de Long, Short y cálculos de cobertura.
 * BASADO EN LÓGICA EXPONENCIAL ACUMULATIVA.
 */

const parseNumber = (val) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

// ==========================================
//          LÓGICA PARA LONG (COMPRA)
// ==========================================

/**
 * Calcula los objetivos de la SIGUIENTE orden basándose en la última ejecutada.
 */
function calculateLongTargets(lastPrice, profit_percent, price_var, size_var, lastAmount) {
    const profitDec = parseNumber(profit_percent) / 100;
    const priceVarDec = parseNumber(price_var) / 100;
    const sizeVarDec = parseNumber(size_var) / 100;

    const p = parseNumber(lastPrice);
    const a = parseNumber(lastAmount);

    return {
        // El TP se calcula sobre el PPC (se maneja en el manager), 
        // pero esta función define el precio de disparo de la siguiente orden.
        nextCoveragePrice: p * (1 - priceVarDec),
        
        // LÓGICA EXPONENCIAL: Monto = Anterior * (1 + multiplicador)
        requiredCoverageAmount: a * (1 + sizeVarDec)
    };
}

/**
 * Simulación de resistencia total (Hasta dónde aguanta el balance).
 */
function calculateLongCoverage(balance, lastPrice, lastAmount, priceVarDec, sizeVarDec) {
    let remainingBalance = parseNumber(balance);
    let currentPriceLevel = parseNumber(lastPrice);
    let nextOrderAmount = parseNumber(lastAmount) * (1 + parseNumber(sizeVarDec));
    let numberOfOrders = 0;

    // LÓGICA EXPONENCIAL: Mientras el balance soporte la siguiente orden creciente
    while (remainingBalance >= nextOrderAmount && nextOrderAmount > 0 && numberOfOrders < 50) {
        remainingBalance -= nextOrderAmount;
        
        // El precio cae exponencialmente
        currentPriceLevel = currentPriceLevel * (1 - parseNumber(priceVarDec));
        
        // El monto crece exponencialmente
        nextOrderAmount = nextOrderAmount * (1 + parseNumber(sizeVarDec));
        
        numberOfOrders++;
    }

    return { 
        coveragePrice: currentPriceLevel, 
        numberOfOrders: numberOfOrders 
    };
}

// ==========================================
//          LÓGICA PARA SHORT (VENTA)
// ==========================================

function calculateShortTargets(lastPrice, profit_percent, price_var, size_var, lastAmount) {
    const priceVarDec = parseNumber(price_var) / 100;
    const sizeVarDec = parseNumber(size_var) / 100;

    const p = parseNumber(lastPrice);
    const a = parseNumber(lastAmount);

    return {
        nextCoveragePrice: p * (1 + priceVarDec), // Sube el precio, vendemos más caro
        requiredCoverageAmount: a * (1 + sizeVarDec)
    };
}

function calculateShortCoverage(balance, lastPrice, lastAmount, priceVarDec, sizeVarDec) {
    let remainingBalance = parseNumber(balance);
    let currentPriceLevel = parseNumber(lastPrice);
    let nextOrderAmount = parseNumber(lastAmount) * (1 + parseNumber(sizeVarDec));
    let numberOfOrders = 0;

    while (remainingBalance >= nextOrderAmount && nextOrderAmount > 0 && numberOfOrders < 50) {
        remainingBalance -= nextOrderAmount;
        
        // En Short el peligro es la subida exponencial del precio
        currentPriceLevel = currentPriceLevel * (1 + parseNumber(priceVarDec));
        nextOrderAmount = nextOrderAmount * (1 + parseNumber(sizeVarDec));
        
        numberOfOrders++;
    }

    return { 
        coveragePrice: currentPriceLevel, 
        numberOfOrders: numberOfOrders 
    };
}

// ==========================================
//          PNL Y UTILIDADES
// ==========================================

/**
 * PNL Flotante (Unrealized PNL)
 * Fórmula: ((Precio Actual - Precio Entrada) * Cantidad) - Comisiones
 */
function calculatePotentialProfit(ppc, ac, currentPrice, strategy = 'long', feeRate = 0.001) {
    const p = parseFloat(currentPrice);
    const entry = parseFloat(ppc);
    const qty = parseFloat(ac);
    
    if (!qty || qty <= 0 || !entry || entry <= 0) return 0;

    // 1. Calcular Ganancia Bruta
    let grossProfit = (strategy === 'long') 
        ? (p - entry) * qty 
        : (entry - p) * qty;
    
    // 2. Fees Reales: BitMart suele cobrar sobre el valor de la transacción
    // Si qty es 0.00006, el fee es minúsculo. 
    const entryValue = entry * qty;
    const exitValue = p * qty;
    const totalFees = (entryValue + exitValue) * feeRate;

    return grossProfit - totalFees;
}

/**
 * Inicializa los valores de la estrategia al dar START
 * Sincronizado con los nuevos IDs: amountUsdt y purchaseUsdt
 */
function calculateInitialState(config, currentPrice) {
    const p = parseNumber(currentPrice);
    
    // Extraemos valores de la configuración que viene del front
    // Usamos los nuevos nombres de variables
    const lAmount = parseNumber(config.long?.amountUsdt || 0);
    const sAmount = parseNumber(config.short?.amountUsdt || 0);

    return {
        // Estado inicial para Long
        long: {
            ...config.long,
            nextCoveragePrice: p * (1 - (parseNumber(config.long?.price_var || 0) / 100)),
            requiredCoverageAmount: lAmount * (1 + (parseNumber(config.long?.size_var || 0) / 100))
        },
        // Estado inicial para Short
        short: {
            ...config.short,
            nextCoveragePrice: p * (1 + (parseNumber(config.short?.price_var || 0) / 100)),
            requiredCoverageAmount: sAmount * (1 + (parseNumber(config.short?.size_var || 0) / 100))
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
    calculateInitialState
};