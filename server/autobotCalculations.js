/**
 * BSB/server/autobotCalculations.js (SOLO LÓGICA LONG Y COMÚN - CORREGIDO)
 */

// const { calculateShortCoverage, calculateShortTargets } = require('./autobotShortCalculations');
const { parseNumber } = require('./utils/helpers'); // 🟢 CORRECCIÓN: Importa desde el nuevo helper

// 🛑 ELIMINADA: Declaración global innecesaria de targetSellPrice
// let targetSellPrice = 0; 

// -------------------------------------------------------------------------
// LÓGICA DE COBERTURA (LONG)
// ... (calculateLongCoverage se mantiene igual) ...
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
// ... (calculateNextDcaPrice se mantiene igual) ...
// -------------------------------------------------------------------------
function calculateNextDcaPrice(ppc, priceVarDecimal, count) {
    return ppc * (1 - priceVarDecimal);
}


// -------------------------------------------------------------------------
// LÓGICA DE TARGETS POST-COMPRA (LONG) - AUDITORÍA DE DEBUGGING
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

    // 🛑 AUDITORÍA CRÍTICA: Ver valores de configuración antes y después del parsing
    console.log(`[DCA DEBUG] Raw Config Values -> Base: [${basePurchaseUsdt}], SizeVar: [${size_var}]`);
    console.log(`[DCA DEBUG] Parsed Values -> Base: ${baseAmount}, SizeDec: ${sizeVarDecimal}, Count: ${count}`);

    // Cálculo del Target de Venta
    const targetSellPrice = ppc * (1 + profitDecimal);
    
    // Cálculo del Monto de Cobertura Requerido
    // requiredCoverageAmount = base * (1 + size_var/100) ^ count
    const requiredCoverageAmount = baseAmount * Math.pow((1 + sizeVarDecimal), count); 

    console.log(`[DCA DEBUG] Required Amount (Calculated): ${requiredCoverageAmount}`);

    // 🛑 AGREGAR VERIFICACIÓN DE FALLO DEL CÁLCULO
    if (requiredCoverageAmount === 0 && count > 0) {
        console.error(`[CRITICAL CALC FAIL] DCA calculated 0.00 USDT. Variables used: 
            Base: ${baseAmount} (Expected 5), 
            SizeVarDec: ${sizeVarDecimal} (Expected 1), 
            Count: ${count} (Expected 3)`);
    }

    // Cálculo del Precio de la Próxima Cobertura
    const nextCoveragePrice = calculateNextDcaPrice(ppc, priceVarDecimal, count); 

    // Cálculo de la Cobertura Máxima (Solo informativo)
    const { coveragePrice: lCoveragePrice, numberOfOrders: lNOrderMax } = calculateLongCoverage(
        balance,
        ppc, 
        requiredCoverageAmount,
        priceVarDecimal,
        sizeVarDecimal
    );
    
    // Devolver 0 si no hay fondos disponibles, pero manteniendo el cálculo requerido
    if(requiredCoverageAmount > balance){
        return { 
            targetSellPrice, nextCoveragePrice, 
            requiredCoverageAmount: finalRequiredAmount, // 👈 USAR EL VALOR FINAL
            lCoveragePrice: nextCoveragePrice, 
            lNOrderMax
        };
    }
    
    return { 
        targetSellPrice, nextCoveragePrice, requiredCoverageAmount: 99.99,
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
};