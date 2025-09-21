// BSB/server/autobotCalculations.js

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

    // Assumes the first order can be placed
    if (currentBalance >= nextOrderAmount) {
        currentBalance -= nextOrderAmount;
        numberOfOrders++;
        coveragePrice = nextOrderPrice;

        // Loop to calculate subsequent orders
        while (true) {
            // Calculate price and amount of the next order
            nextOrderPrice = nextOrderPrice * (1 - decrement);
            nextOrderAmount = nextOrderAmount * (1 + increment);

            // Check if the balance is sufficient for the next order
            if (currentBalance >= nextOrderAmount) {
                currentBalance -= nextOrderAmount;
                numberOfOrders++;
                coveragePrice = nextOrderPrice;
            } else {
                // Not enough balance, exit the loop
                break;
            }
        }
    } else {
        // If initial balance is less than the first order amount
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

    // Assumes the first order can be placed
    if (currentBalance >= nextOrderAmount) {
        currentBalance -= nextOrderAmount;
        numberOfOrders++;
        coveragePrice = nextOrderPrice;

        // Loop to calculate subsequent orders
        while (true) {
            // Calculate price and amount of the next order
            nextOrderPrice = nextOrderPrice * (1 + increment);
            nextOrderAmount = nextOrderAmount * (1 + sizeIncrement);

            // Check if the balance is sufficient for the next order
            if (currentBalance >= nextOrderAmount) {
                currentBalance -= nextOrderAmount;
                numberOfOrders++;
                coveragePrice = nextOrderPrice;
            } else {
                // Not enough balance, exit the loop
                break;
            }
        }
    } else {
        // If initial balance is less than the first order amount
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

    const lbalance = parseFloat(long.amountUsdt) || 0;
    const sbalance = parseFloat(short.amountBtc) || 0;

    // Calculate coverage and number of Long orders
    const { coveragePrice: lcoverage, numberOfOrders: lnorder } = calculateLongCoverage(
        lbalance,
        currentPrice,
        parseFloat(long.purchaseUsdt) || 0,
        (parseFloat(long.price_var) || 0) / 100, // Convert to decimal
        (parseFloat(long.size_var) || 0) / 100 // Convert to decimal
    );

    // Calculate coverage and number of Short orders
    const { coveragePrice: scoverage, numberOfOrders: snorder } = calculateShortCoverage(
        sbalance,
        currentPrice,
        parseFloat(short.sellBtc) || 0,
        (parseFloat(short.price_var) || 0) / 100, // Convert to decimal
        (parseFloat(short.size_var) || 0) / 100 // Convert to decimal
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