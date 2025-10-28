/**
 * BSB/server/autobotCalculations.js (SOLO LÓGICA LONG Y COMÚN - CORREGIDO)
 */

//const { calculateShortCoverage, calculateShortTargets } = require('./autobotShortCalculations');
const { parseNumber } = require('./utils/helpers'); // 🟢 CORRECCIÓN: Importa desde el nuevo helper

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
// FUNCIÓN AUXILIAR AGREGADA: Calcula el precio de la N-ésima orden DCA (Long)
// -------------------------------------------------------------------------
/**
 * Calcula el precio exacto de la próxima orden de cobertura (DCA)
 * aplicando el price_var (decremento) al Precio Promedio de Compra (PPC) actual.
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
    
    // 🟢 AUDITORÍA FORZADA
console.log(`[DCA AUDIT CALC] Base: ${baseAmount} (from ${basePurchaseUsdt}), SizeVarDec: ${sizeVarDecimal} (from ${size_var}), Count: ${count}`);

const targetSellPrice = ppc * (1 + profitDecimal);
    
// Calcular el monto requerido para la próxima orden
const requiredCoverageAmount = baseAmount * Math.pow((1 + sizeVarDecimal), count); 

console.log(`[DCA AUDIT RESULT] Required Amount Calculated: ${requiredCoverageAmount}`);

    // 🛑 AGREGAR VERIFICACIÓN DE FALLO DEL CÁLCULO
if (requiredCoverageAmount === 0 && count > 0) {
    console.error(`[CRITICAL CALC FAIL] DCA calculated 0.00 USDT. Variables used: 
        Base: ${baseAmount} (Expected 5), 
        SizeVarDec: ${sizeVarDecimal} (Expected 1), 
        Count: ${count} (Expected 3)`);
}

    // 🟢 CORRECCIÓN CLAVE: Usamos la función auxiliar para calcular el precio de la próxima orden.
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
};