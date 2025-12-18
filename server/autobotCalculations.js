/**
 * BSB/server/autobotCalculations.js (SOLO LÓGICA LONG Y COMÚN)
 */

const { parseNumber } = require('./utils/helpers'); // Importa el helper

// 🛑 ELIMINADA LA IMPORTACIÓN: const { calculateShortCoverage, calculateShortTargets } = require('./calculateShortTargets');

// -------------------------------------------------------------------------
// LÓGICA DE COBERTURA (LONG)
// -------------------------------------------------------------------------
function calculateLongCoverage(lbalance, currentPrice, nextOrderAmount, priceVarDecimal, sizeVarDecimal) {
    let currentBalance = lbalance;
    let nextPrice = currentPrice;
    let nextAmount = nextOrderAmount; // Ya viene calculado como 48 desde el logic
    let numberOfOrders = 0;
    let coveragePrice = currentPrice;

    // Bucle de simulación pura
    while (true) {
        // ¿Tengo suficiente para la orden que toca?
        if (currentBalance >= nextAmount && nextAmount > 0) {
            currentBalance -= nextAmount;
            numberOfOrders++;
            
            // Calculamos cómo sería la SIGUIENTE después de esta
            nextPrice = nextPrice * (1 - priceVarDecimal);
            nextAmount = nextAmount * (1 + sizeVarDecimal);
            
            // Actualizamos el precio de cobertura alcanzado
            coveragePrice = nextPrice;
        } else {
            // Si no alcanzó ni para la primera, el bucle se rompe
            // y numberOfOrders se queda en 0.
            break;
        }
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
function calculateLongTargets(ppc, profit_percent, price_var, size_var, basePurchaseUsdt, orderCountInCycle, lbalance, lastExecutionPrice) {
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


    const referencePrice = (count > 0 && lastExecutionPrice > 0) ? lastExecutionPrice : ppc;

    const nextCoveragePrice = calculateNextDcaPrice(referencePrice, priceVarDecimal, count); 

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

/**
 * Calcula la ganancia o pérdida potencial en USDT si la posición actual se vendiera al precio de mercado.
 * @param {number} ppc - Precio Promedio de Costo (PPC) de la posición.
 * @param {number} ac - Cantidad acumulada de criptomoneda comprada (AC).
 * @param {number} currentPrice - Precio actual de mercado.
 * @param {number} feeRate - Tasa de comisión de BitMart (ej: 0.001 para 0.1%).
 * @returns {number} Ganancia/Pérdida potencial en USDT.
 */
function calculatePotentialProfit(ppc, ac, currentPrice, feeRate) {
    if (ac === 0) {
        return 0; // No hay posición abierta.
    }

    // 1. Costo total de adquisición (USD)
    const totalCostUsdt = ppc * ac;

    // 2. Valor de venta potencial (USD)
    const potentialSaleValueUsdt = currentPrice * ac;

    // 3. Comisión de venta (se aplica sobre el valor de venta)
    const saleFeeUsdt = potentialSaleValueUsdt * feeRate;

    // 4. Ganancia Bruta (antes de comisiones de salida)
    const grossProfit = potentialSaleValueUsdt - totalCostUsdt;
    
    // 5. Ganancia Neta (restamos la comisión de la venta final)
    // Nota: Las comisiones de compra ya están implicitas en el PPC y el totalCost.
    const netPotentialProfit = grossProfit - saleFeeUsdt;

    return netPotentialProfit;
}

module.exports = {
    parseNumber,
    calculateInitialState,
    calculateLongCoverage,
    calculateLongTargets,
    calculatePotentialProfit,    
};