/**
 * BSB/server/autobotCalculations.js (SOLO LÓGICA LONG Y COMÚN)
 */

const { parseNumber } = require('./utils/helpers'); // Importa el helper

// 🛑 ELIMINADA LA IMPORTACIÓN: const { calculateShortCoverage, calculateShortTargets } = require('./calculateShortTargets');

// -------------------------------------------------------------------------
// LÓGICA DE COBERTURA (LONG)
// -------------------------------------------------------------------------
function calculateLongCoverage(lbalance, currentPrice, purchaseUsdt, priceVarDecimal, sizeVarDecimal) {
    let currentBalance = lbalance;
    let nextOrderPrice = currentPrice;
    let nextOrderAmount = purchaseUsdt;
    let numberOfOrders = 0;
    let coveragePrice = currentPrice;
    
    // Convertir porcentajes a decimales (asumiendo que los parámetros de entrada son decimales aquí)
    const decrement = priceVarDecimal; 
    const increment = sizeVarDecimal;

    if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) {
        // ... (cuerpo de la función calculateLongCoverage - se mantiene la lógica) ...
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
// FUNCIÓN AUXILIAR DCA (Long)
// -------------------------------------------------------------------------
function calculateNextDcaPrice(ppc, priceVarDecimal, count) {
    // 💡 count no se usa en esta fórmula, solo en el cálculo recursivo de coverage.
    return ppc * (1 - priceVarDecimal);
}


// -------------------------------------------------------------------------
// LÓGICA DE TARGETS POST-COMPRA (LONG)
// -------------------------------------------------------------------------
function calculateLongTargets(ppc, profit_percent, price_var, size_var, basePurchaseUsdt, orderCountInCycle, lbalance) {
    const profitDecimal = parseNumber(profit_percent) / 100;
    const priceVarDecimal = parseNumber(price_var) / 100;
    const sizeVarDecimal = parseNumber(size_var) / 100;
    const baseAmount = parseNumber(basePurchaseUsdt);
    const count = orderCountInCycle || 0;
    const balance = parseNumber(lbalance);

    // ... (Logs de auditoría y lógica de cálculo) ...

    const targetSellPrice = ppc * (1 + profitDecimal);
    const calculatedAmount = baseAmount * Math.pow((1 + sizeVarDecimal), count); 
    let finalRequiredAmount = calculatedAmount;

    // 🛑 Eliminar o comentar las LÓGICAS DE PRUEBA Y DE FALLO CRÍTICO una vez resuelto
    // if (calculatedAmount === 0 && count > 0) { ... }
    // if (finalRequiredAmount === 0 && count > 0) { ... }


    const nextCoveragePrice = calculateNextDcaPrice(ppc, priceVarDecimal, count); 

    const { coveragePrice: lCoveragePrice, numberOfOrders: lNOrderMax } = calculateLongCoverage(
        balance,
        ppc, 
        finalRequiredAmount, 
        priceVarDecimal,
        sizeVarDecimal
    );

    if(finalRequiredAmount > balance){
        return { 
            targetSellPrice, nextCoveragePrice, 
            requiredCoverageAmount: finalRequiredAmount,
            lCoveragePrice: nextCoveragePrice, 
            lNOrderMax
        };
    }

    return { 
        targetSellPrice, nextCoveragePrice, requiredCoverageAmount: finalRequiredAmount,
        lCoveragePrice, lNOrderMax 
    };
}

// -------------------------------------------------------------------------
// LÓGICA DE ESTADO INICIAL (DEBE SER MÍNIMA O MOVIDA)
// -------------------------------------------------------------------------

// 🛑 calculateInitialState ahora SOLO usa la lógica Long y NO la Short
function calculateInitialState(config, currentPrice) {
    const { long, short } = config;

    const lbalance = parseNumber(long.amountUsdt);
    const sbalance = parseNumber(short.amountBtc); // Se mantiene el balance Short

    // LONG INITIAL CALCULATIONS
    const { coveragePrice: lcoverage, numberOfOrders: lnorder } = calculateLongCoverage(
        lbalance,
        currentPrice,
        parseNumber(long.purchaseUsdt),
        parseNumber(long.price_var) / 100,
        parseNumber(long.size_var) / 100
    );

    // 🛑 Se inicializan los valores Short sin llamar a calculateShortCoverage
    const scoverage = 0; 
    const snorder = 0;

    return {
        lstate: 'BUYING', sstate: 'RUNNING', profit: 0, // Inicia Short en RUNNING (para esperar señal)
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
    // 🛑 Ya no exportamos calculateNextDcaPrice a menos que sea necesario fuera
};