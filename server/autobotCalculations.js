/**
 * BSB/server/autobotCalculations.js (SOLO LÓGICA LONG Y COMÚN)
 */

const { calculateShortCoverage, calculateShortTargets } = require('./autobotShortCalculations'); // 💡 IMPORTAR SHORT

/**
 * Helper function to safely parse a value as a number.
 */
function parseNumber(value) {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
}

// -------------------------------------------------------------------------
// LÓGICA DE COBERTURA (LONG)
// -------------------------------------------------------------------------

/**
 * Calcula la cobertura de precio (LCoverage) y número de órdenes (LNOrder) para Long.
 */
function calculateLongCoverage(lbalance, currentPrice, purchaseUsdt, decrement, increment) {
    let currentBalance = lbalance;
    let nextOrderPrice = currentPrice;
    let nextOrderAmount = purchaseUsdt;
    let numberOfOrders = 0;
    let coveragePrice = currentPrice;

    if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) {
        currentBalance -= nextOrderAmount;
        numberOfOrders++;
        coveragePrice = nextOrderPrice * (1 - decrement);
        
        while (true) {
            nextOrderPrice = nextOrderPrice * (1 - decrement);
            nextOrderAmount = nextOrderAmount * (1 + increment);

            if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) {
                currentBalance -= nextOrderAmount;
                numberOfOrders++;
                coveragePrice = nextOrderPrice * (1 - decrement);
            } else {
                coveragePrice = nextOrderPrice; 
                break;
            }
        }
    } else {
        return { coveragePrice: currentPrice, numberOfOrders: 0 };
    }
    
    return { coveragePrice, numberOfOrders };
}


// -------------------------------------------------------------------------
// LÓGICA DE TARGETS POST-COMPRA (LONG)
// -------------------------------------------------------------------------

/**
 * Calcula los targets de Venta (Take Profit) y Cobertura (DCA) después de una compra (LONG).
 */
function calculateLongTargets(ppc, profit_percent, price_var, size_var, basePurchaseUsdt, orderCountInCycle, lbalance) {
    const profitDecimal = parseNumber(profit_percent) / 100;
    const priceVarDecimal = parseNumber(price_var) / 100;
    const sizeVarDecimal = parseNumber(size_var) / 100;
    const baseAmount = parseNumber(basePurchaseUsdt);
    const count = orderCountInCycle || 0;
    const balance = parseNumber(lbalance);

    const targetSellPrice = ppc * (1 + profitDecimal);
    const requiredCoverageAmount = baseAmount * Math.pow((1 + sizeVarDecimal), count);
    const nextCoveragePrice = ppc * (1 - priceVarDecimal); 

    const { coveragePrice: lCoveragePrice, numberOfOrders: lNOrderMax } = calculateLongCoverage(
        balance,
        ppc,
        requiredCoverageAmount,
        priceVarDecimal,
        sizeVarDecimal
    );
    
    if(requiredCoverageAmount > balance){
        return { 
            targetSellPrice, nextCoveragePrice, 
            requiredCoverageAmount: 0,
            lCoveragePrice: nextCoveragePrice, 
            lNOrderMax: 0 
        };
    }
    
    return { 
        targetSellPrice, nextCoveragePrice, requiredCoverageAmount,
        lCoveragePrice, lNOrderMax 
    };
}


/**
 * Calculates the initial state of the bot's parameters (USA BOTH).
 */
function calculateInitialState(config, currentPrice) {
    const { long, short } = config;

    const lbalance = parseNumber(long.amountUsdt);
    const sbalance = parseNumber(short.amountBtc);

    // LONG INITIAL CALCULATIONS
    const { coveragePrice: lcoverage, numberOfOrders: lnorder } = calculateLongCoverage(
        lbalance,
        currentPrice,
        parseNumber(long.purchaseUsdt),
        parseNumber(long.price_var) / 100,
        parseNumber(long.size_var) / 100
    );

    // SHORT INITIAL CALCULATIONS (Llama al nuevo archivo)
    const { coveragePrice: scoverage, numberOfOrders: snorder } = calculateShortCoverage(
        sbalance,
        currentPrice,
        parseNumber(short.sellBtc),
        parseNumber(short.price_var) / 100,
        parseNumber(short.size_var) / 100
    );

    return {
        lstate: 'STOPPED', sstate: 'STOPPED', profit: 0,
        lbalance: lbalance, sbalance: sbalance,
        ltprice: 0, stprice: 0, lcycle: 0, scycle: 0,
        lcoverage: lcoverage, scoverage: scoverage,
        lnorder: lnorder, snorder: snorder,
    };
}

module.exports = {
    parseNumber,
    calculateInitialState,
    calculateLongCoverage,
    calculateLongTargets,
    // NO exportamos las funciones Short aquí, solo las importamos y usamos en calculateInitialState.
};