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
 * for the Long strategy. (Mantiene el código original)
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

    if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) {
        currentBalance -= nextOrderAmount;
        numberOfOrders++;
        coveragePrice = nextOrderPrice;

        while (true) {
            nextOrderPrice = nextOrderPrice * (1 - decrement);
            nextOrderAmount = nextOrderAmount * (1 + increment);

            if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) {
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
 * for the Short strategy. (Mantiene el código original)
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

    if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) {
        currentBalance -= nextOrderAmount;
        numberOfOrders++;
        coveragePrice = nextOrderPrice;

        while (true) {
            nextOrderPrice = nextOrderPrice * (1 + increment);
            nextOrderAmount = nextOrderAmount * (1 + sizeIncrement);
            
            if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) {
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
 * 🚨 FUNCIÓN FALTANTE: Calcula los targets de Venta (Take Profit) y Cobertura (DCA)
 * después de una compra.
 * * @param {number} ppc - Precio Promedio de Compra de la posición actual (lStateData.ppc).
 * @param {number} profit_percent - Porcentaje de ganancia deseado (ej: 0.01 para 1%).
 * @param {number} price_var - Variación de precio para la próxima orden de cobertura (ej: 0.01 para 1%).
 * @param {number} size_var - Variación de tamaño para la próxima orden de cobertura (ej: 1 para 100%).
 * @param {number} basePurchaseUsdt - El monto base del primer DCA en USDT (config.long.purchaseUsdt).
 * @param {number} orderCountInCycle - El número de órdenes ya ejecutadas en el ciclo (lStateData.orderCountInCycle).
 * @returns {object} Objeto con targetSellPrice, nextCoveragePrice, y requiredCoverageAmount.
 */
function calculateLongTargets(ppc, profit_percent, price_var, size_var, basePurchaseUsdt, orderCountInCycle) {
    const profitDecimal = parseNumber(profit_percent) / 100;
    const priceVarDecimal = parseNumber(price_var) / 100;
    const sizeVarDecimal = parseNumber(size_var) / 100;
    const baseAmount = parseNumber(basePurchaseUsdt);
    const count = orderCountInCycle || 0;

    // 1. Calcular el Precio de Venta (Take Profit)
    const targetSellPrice = ppc * (1 + profitDecimal);

    // 2. Calcular el Precio de la Próxima Cobertura (DCA)
    // Se usa el PPC como precio de referencia para la caída
    const nextCoveragePrice = ppc * (1 - priceVarDecimal); 

    // 3. Calcular el Monto Requerido para la Próxima Cobertura
    // La fórmula es: baseAmount * (1 + size_var)^count
    const requiredCoverageAmount = baseAmount * Math.pow((1 + sizeVarDecimal), count);

    return { 
        targetSellPrice, 
        nextCoveragePrice, 
        requiredCoverageAmount 
    };
}


/**
 * Calculates the initial state of the bot's parameters. (Mantiene el código original)
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
    parseNumber,
    calculateInitialState,
    calculateLongCoverage,
    calculateShortCoverage,
    calculateLongTargets // ⬅️ ¡CORRECCIÓN CRÍTICA: Exportación agregada!
};