/**
 * BSB/server/autobotCalculations.js (SOLO LÓGICA LONG Y COMÚN - CORREGIDO CON AI)
 */

// const { calculateShortCoverage, calculateShortTargets } = require('./autobotShortCalculations');
const { parseNumber } = require('./utils/helpers'); // 🟢 CORRECCIÓN: Importa desde el nuevo helper

// -------------------------------------------------------------------------
// LÓGICA DE COBERTURA (LONG)
// -------------------------------------------------------------------------
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
function calculateNextDcaPrice(ppc, priceVarDecimal, count) {
    // Si count es 0 (primera orden DCA), el precio es PPC * (1 - priceVarDecimal)
    // Si count > 0, el precio de la N-ésima orden DCA es ppc * (1 - priceVarDecimal)
    return ppc * (1 - priceVarDecimal);
}


// -------------------------------------------------------------------------
// LÓGICA DE TARGETS POST-COMPRA (LONG) - CORREGIDA
// -------------------------------------------------------------------------

/**
 * Calcula los targets de Venta (Take Profit) y Cobertura (DCA) después de una compra (LONG).
 *
 * @param {number} ppc - Precio promedio de compra actual.
 * @param {number} profit_percent - Porcentaje de ganancia.
 * @param {number} price_var - Variación de precio para la próxima compra (%).
 * @param {number} size_var - Variación de tamaño para la próxima compra (%).
 * @param {number} basePurchaseUsdt - Monto base de la compra inicial.
 * @param {number} orderCountInCycle - Número de órdenes de DCA ejecutadas en el ciclo (0, 1, 2...).
 * @param {number} lbalance - Balance USDT disponible.
 * @param {number} amountInvested - Monto total invertido en USDT en la posición actual (AI).
 */
function calculateLongTargets(ppc, profit_percent, price_var, size_var, basePurchaseUsdt, orderCountInCycle, lbalance, amountInvested) {
    const profitDecimal = parseNumber(profit_percent) / 100;
    const priceVarDecimal = parseNumber(price_var) / 100;
    const sizeVarDecimal = parseNumber(size_var) / 100;
    const baseAmount = parseNumber(basePurchaseUsdt);
    const count = orderCountInCycle || 0;
    const balance = parseNumber(lbalance);
    const ai = parseNumber(amountInvested); // <-- NUEVO CAMPO PARSEADO

    // 🛑 AUDITORÍA CRÍTICA
    console.log(`[DCA DEBUG] Raw Config Values -> Base: [${basePurchaseUsdt}], SizeVar: [${size_var}]`);
    console.log(`[DCA DEBUG] Parsed Values -> Base: ${baseAmount}, SizeDec: ${sizeVarDecimal}, Count: ${count}`);
    console.log(`[DCA DEBUG] Amount Invested (AI): ${ai.toFixed(2)} USDT.`); // <-- NUEVO LOG PARA AI

    // Cálculo del Target de Venta
    const targetSellPrice = ppc * (1 + profitDecimal);

    // Cálculo del Monto de Cobertura Requerido (mantiene la progresión geométrica basada en Count)
    const calculatedAmount = baseAmount * Math.pow((1 + sizeVarDecimal), count); 

    console.log(`[DCA DEBUG] Required Amount (Calculated): ${calculatedAmount}`);

    let finalRequiredAmount = calculatedAmount;

    // 🎯 LÓGICA DE PRUEBA: Si es 0, lo cambiamos a 99.99.
    if (calculatedAmount === 0 && count > 0) {
        console.error("[CRITICAL TEST] CALCULO FALLIDO (0). Forzando RequiredAmount a 99.99 para prueba de persistencia.");
        finalRequiredAmount = 99.99;
    }

    // 🛑 AGREGAR VERIFICACIÓN DE FALLO DEL CÁLCULO
    if (finalRequiredAmount === 0 && count > 0) {
        console.error(`[CRITICAL CALC FAIL] DCA calculated 0.00 USDT... (Variables usadas: Base: ${baseAmount}, SizeVarDec: ${sizeVarDecimal}, Count: ${count})`);
    }

    // Cálculo del Precio de la Próxima Cobertura
    const nextCoveragePrice = calculateNextDcaPrice(ppc, priceVarDecimal, count); 

    // Cálculo de la Cobertura Máxima (Solo informativo)
    const { coveragePrice: lCoveragePrice, numberOfOrders: lNOrderMax } = calculateLongCoverage(
        balance,
        ppc, 
        finalRequiredAmount, // 👈 Usar finalRequiredAmount
        priceVarDecimal,
        sizeVarDecimal
    );

    // Devolver 0 si no hay fondos disponibles, pero manteniendo el cálculo requerido
    if(finalRequiredAmount > balance){ // 👈 Usar finalRequiredAmount
        return { 
            targetSellPrice, nextCoveragePrice, 
            requiredCoverageAmount: finalRequiredAmount,
            lCoveragePrice: nextCoveragePrice, 
            lNOrderMax
        };
    }

    return { 
        targetSellPrice, nextCoveragePrice, requiredCoverageAmount: finalRequiredAmount, // 👈 Usar finalRequiredAmount
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

    // 🛑 SHORT INITIAL CALCULATIONS (COMENTADA POR DEPENDENCIA CIRCULAR)
    /*
    const { coveragePrice: scoverage, numberOfOrders: snorder } = calculateShortCoverage(
        sbalance,
        currentPrice,
        parseNumber(short.sellBtc),
        parseNumber(short.price_var) / 100,
        parseNumber(short.size_var) / 100
    );
    */
    const scoverage = 0; // Inicializar a 0 si la lógica está comentada
    const snorder = 0;

    return {
        lstate: 'BUYING', sstate: 'STOPPED', profit: 0, // Aseguramos que sstate esté en STOPPED
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
    calculateNextDcaPrice, // <-- Exportación añadida
};