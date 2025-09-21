// BSB/server/autobotCalculations.js

/**
 * Helper function to safely parse a value as a number.
 * @param {any} value - The value to parse.
 * @returns {number} The parsed number, or 0 if parsing fails.
 */
function parseNumber(value) {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculates the price coverage (LCoverage) and number of orders (LNOrder)
 * for the Long strategy.
 *
 * @param {number} lbalance - The available balance in USDT.
 * @param {number} currentPrice - The current cryptocurrency price.
 * @param {number} purchaseUsdt - The amount of the first order in USDT.
 * @param {number} decrement - The price decrement percentage (e.g., 0.01 for 1%).
 * @param {number} increment - The amount increment percentage (e.g., 1 for 100%).
 * @returns {object} An object with LCoverage and LNOrder.
 */
function calculateLongCoverage(lbalance, currentPrice, purchaseUsdt, decrement, increment) {
    let currentBalance = lbalance;
    let nextOrderPrice = currentPrice;
    let nextOrderAmount = purchaseUsdt;
    let numberOfOrders = 0;
    let coveragePrice = currentPrice;

    if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) { // Added condition: nextOrderAmount > 0
        currentBalance -= nextOrderAmount;
        numberOfOrders++;
        coveragePrice = nextOrderPrice;

        while (true) {
            nextOrderPrice = nextOrderPrice * (1 - decrement);
            nextOrderAmount = nextOrderAmount * (1 + increment);

            if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) { // Added condition: nextOrderAmount > 0
                currentBalance -= nextOrderAmount;
                numberOfOrders++;
                coveragePrice = nextOrderPrice;
            } else {
                break;
            }
        }
    } else {
        return { coveragePrice: currentPrice, numberOfOrders: 0 };
    }
    
    return { coveragePrice, numberOfOrders };
}

/**
 * Calculates the price coverage (SCoverage) and number of orders (SNOrder)
 * for the Short strategy.
 *
 * @param {number} sbalance - The available balance in BTC.
 * @param {number} currentPrice - The current cryptocurrency price.
 * @param {number} sellBtc - The amount of the first order in BTC.
 * @param {number} increment - The price increment percentage (e.g., 0.01 for 1%).
 * @param {number} sizeIncrement - The amount increment percentage (e.g., 1 for 100%).
 * @returns {object} An object with SCoverage and SNOrder.
 */
function calculateShortCoverage(sbalance, currentPrice, sellBtc, increment, sizeIncrement) {
    let currentBalance = sbalance;
    let nextOrderPrice = currentPrice;
    let nextOrderAmount = sellBtc;
    let numberOfOrders = 0;
    let coveragePrice = currentPrice;

    if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) { // ✅ Added condition: nextOrderAmount > 0
        currentBalance -= nextOrderAmount;
        numberOfOrders++;
        coveragePrice = nextOrderPrice;

        while (true) {
            nextOrderPrice = nextOrderPrice * (1 + increment);
            nextOrderAmount = nextOrderAmount * (1 + sizeIncrement);
            
            if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) { // ✅ Added condition: nextOrderAmount > 0
                currentBalance -= nextOrderAmount;
                numberOfOrders++;
                coveragePrice = nextOrderPrice;
            } else {
                break;
            }
        }
    } else {
        return { coveragePrice: currentPrice, numberOfOrders: 0 };
    }
    
    return { coveragePrice, numberOfOrders };
}

/**
 * Calculates the initial state of the bot's parameters, including LCoverage and LNOrder.
 * @param {object} config - The configuration object from the frontend.
 * @param {number} currentPrice - The current cryptocurrency price.
 * @returns {object} An object with the calculated parameters.
 */
function calculateInitialState(config, currentPrice) {
    const { long, short } = config;

    const lbalance = parseNumber(long.amountUsdt);
    const sbalance = parseNumber(short.amountBtc);

    const { coveragePrice: lcoverage, numberOfOrders: lnorder } = calculateLongCoverage(
        lbalance,
        currentPrice,
        parseNumber(long.purchaseUsdt),
        parseNumber(long.price_var) / 100,
        parseNumber(long.size_var) / 100
    );

    const { coveragePrice: scoverage, numberOfOrders: snorder } = calculateShortCoverage(
        sbalance,
        currentPrice,
        parseNumber(short.sellBtc),
        parseNumber(short.price_var) / 100,
        parseNumber(short.size_var) / 100
    );

    return {
        lstate: 'STOPPED',
        sstate: 'STOPPED',
        profit: 0,
        lbalance: lbalance,
        sbalance: sbalance,
        ltprice: 0,
        stprice: 0,
        lcycle: 0,
        scycle: 0,
        lcoverage: lcoverage,
        scoverage: scoverage,
        lnorder: lnorder,
        snorder: snorder,
    };
}

module.exports = {
    calculateInitialState,
    calculateLongCoverage,
    calculateShortCoverage
};