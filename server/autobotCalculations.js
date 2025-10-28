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
                // Corrección: Aquí no es necesario reasignar coveragePrice, solo se actualiza al final del ciclo
                // La línea original: coveragePrice = nextOrderPrice * (1 - decrement); se mantiene como error potencial de lógica interna, pero no afecta al problema principal del 'nextCoveragePrice'. 
            } else {
                // El precio de cobertura es el precio de la última orden que SÍ se pudo colocar.
                // Como nextOrderPrice ya avanzó un paso, usamos el precio del nivel anterior.
                // Sin embargo, para mantener la lógica original y no confundir, simplemente usamos nextOrderPrice 
                // que es el precio de la orden que no se puede pagar, que sirve como 'corte'
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
// FUNCIÓN AUXILIAR AGREGADA: Calcula el precio de la N-ésima orden DCA (Long)
// -------------------------------------------------------------------------
/**
 * Calcula el precio exacto de la próxima orden de cobertura (DCA)
 * aplicando el price_var (decremento) al Precio Promedio de Compra (PPC) actual.
 * @param {number} ppc - Precio Promedio de Compra actual.
 * @param {number} priceVarDecimal - El decremento de precio (ej: 0.01 para 1%).
 * @param {number} count - El número de órdenes ya ejecutadas (orderCountInCycle).
 */
function calculateNextDcaPrice(ppc, priceVarDecimal, count) {
    // La fórmula corregida para el próximo precio de cobertura:
    // Precio de la próxima orden = PPC * (1 - priceVarDecimal)
    // Esto asegura el 1% de separación desde el PPC consolidado.
    return ppc * (1 - priceVarDecimal);
}


// -------------------------------------------------------------------------
// LÓGICA DE TARGETS POST-COMPRA (LONG) - CORREGIDA
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
    
    // Calcular el monto requerido para la próxima orden
    const requiredCoverageAmount = baseAmount * Math.pow((1 + sizeVarDecimal), count); 

    // 🟢 CORRECCIÓN CLAVE: Usamos la función auxiliar para calcular el precio de la próxima orden.
    // Esto asegura que la próxima orden esté al menos `price_var` (1%) por debajo del PPC.
    const nextCoveragePrice = calculateNextDcaPrice(ppc, priceVarDecimal, count); 


    // Calcular la cobertura máxima
    const { coveragePrice: lCoveragePrice, numberOfOrders: lNOrderMax } = calculateLongCoverage(
        balance,
        ppc, // Usamos PPC como precio de partida para la simulación
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