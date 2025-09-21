// BSB/server/autobotCalculations.js

/**
 * Calcula la cobertura de precio (LCoverage) y el número de órdenes (LNOrder)
 * para la estrategia Long.
 *
 * @param {number} lbalance - El balance disponible en USDT.
 * @param {number} currentPrice - El precio actual de la criptomoneda.
 * @param {number} purchaseUsdt - El monto de la primera orden en USDT.
 * @param {number} decrement - El porcentaje de decremento del precio (ej: 0.01 para 1%).
 * @param {number} increment - El porcentaje de incremento del monto (ej: 1 para 100%).
 * @returns {object} Un objeto con LCoverage y LNOrder.
 */
function calculateLongCoverage(lbalance, currentPrice, purchaseUsdt, decrement, increment) {
    let currentBalance = lbalance;
    let nextOrderPrice = currentPrice;
    let nextOrderAmount = purchaseUsdt;
    let numberOfOrders = 0;
    let coveragePrice = currentPrice;

    // Se asume que la primera orden se puede colocar
    if (currentBalance >= nextOrderAmount) {
        currentBalance -= nextOrderAmount;
        numberOfOrders++;
        coveragePrice = nextOrderPrice;

        // Bucle para calcular las órdenes subsecuentes
        while (true) {
            // Calcular precio y monto de la siguiente orden
            nextOrderPrice = nextOrderPrice * (1 - decrement);
            nextOrderAmount = nextOrderAmount * (1 + increment);

            // Verificar si el balance es suficiente para la siguiente orden
            if (currentBalance >= nextOrderAmount) {
                currentBalance -= nextOrderAmount;
                numberOfOrders++;
                coveragePrice = nextOrderPrice;
            } else {
                // El balance no es suficiente, salimos del bucle
                break;
            }
        }
    } else {
        // Si el balance inicial es menor que el monto de la primera orden
        return { coveragePrice: currentPrice, numberOfOrders: 0 };
    }
    
    return { coveragePrice, numberOfOrders };
}


/**
 * Calcula el estado inicial de los parámetros del bot, incluyendo LCoverage y LNOrder.
 * @param {object} config - El objeto de configuración del frontend.
 * @param {number} currentPrice - El precio actual de la criptomoneda.
 * @returns {object} Un objeto con los parámetros calculados.
 */
function calculateInitialState(config, currentPrice) {
    const { long, short } = config;

    const lbalance = parseFloat(long.amountUsdt) || 0;
    const sbalance = parseFloat(short.amountBtc) || 0;

    // Calcular la cobertura y el número de órdenes Long
    const { coveragePrice: lcoverage, numberOfOrders: lnorder } = calculateLongCoverage(
        lbalance,
        currentPrice,
        parseFloat(long.purchaseUsdt) || 0,
        (parseFloat(long.price_var) || 0) / 100, // Convertir a decimal
        (parseFloat(long.size_var) || 0) / 100 // Convertir a decimal
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
        scoverage: 0, // Aún no implementamos Short
        lnorder: lnorder,
        snorder: 0 // Aún no implementamos Short
    };
}

module.exports = {
    calculateInitialState,
    calculateLongCoverage
};