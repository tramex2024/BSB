/**
 * BSB/server/autobotCalculations.js (FINAL - Corregido y Optimizado)
 */

const { parseNumber } = require('./utils/helpers');

// -------------------------------------------------------------------------
// LÓGICA DE COBERTURA (LONG)
// -------------------------------------------------------------------------
/**
 * Calcula el Precio Límite de Cobertura y el número máximo de órdenes posibles
 * basándose en el saldo actual y los parámetros de grid.
 *
 * @param {number} lbalance - Saldo actual en USDT disponible.
 * @param {number} ppc - Precio Promedio de Compra actual (o currentPrice).
 * @param {number} basePurchaseUsdt - Monto USDT de la orden de cobertura N=1.
 * @param {number} decrement - Variación de precio (decimal, ej. 0.01).
 * @param {number} increment - Variación de tamaño de orden (decimal, ej. 0.02).
 * @returns {{coveragePrice: number, numberOfOrders: number}}
 */
function calculateLongCoverage(lbalance, ppc, basePurchaseUsdt, decrement, increment) {
    let currentBalance = parseNumber(lbalance);
    let nextOrderPrice = parseNumber(ppc);
    let numberOfOrders = 0;
    let coveragePrice = nextOrderPrice; // Inicializar al PPC

    const baseAmount = parseNumber(basePurchaseUsdt);

    if (baseAmount <= 0 || currentBalance <= 0) {
        return { coveragePrice: nextOrderPrice, numberOfOrders: 0 };
    }

    // Bucle que evalúa si podemos costear la orden N+1 (donde N = numberOfOrders)
    while (true) {
        // Incrementamos el contador para calcular el target N+1
        numberOfOrders++;
        
        // 1. Calcular el precio y monto de la orden N+1
        // Precio: PPC * (1 - Dec)^N
        nextOrderPrice = parseNumber(ppc) * Math.pow((1 - decrement), numberOfOrders);
        
        // Monto: Base * (1 + Inc)^(N-1) (ya que numberOfOrders representa el índice)
        const nextOrderAmount = baseAmount * Math.pow((1 + increment), numberOfOrders - 1);

        if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) {
            // Si hay fondos, consumimos el balance y guardamos el precio como límite
            currentBalance -= nextOrderAmount;
            coveragePrice = nextOrderPrice; 
        } else {
            // Si no hay fondos para la orden N+1, detenemos el bucle
            numberOfOrders--; // Descontamos la orden que no se pudo costear
            break;
        }
    }
    
    return { coveragePrice, numberOfOrders };
}


// -------------------------------------------------------------------------
// LÓGICA DE TARGETS POST-COMPRA (LONG)
// -------------------------------------------------------------------------
/**
 * Calcula los targets de Venta (Take Profit) y Cobertura (DCA) después de una compra (LONG).
 */
function calculateLongTargets(ppc, profit_percent, price_var, size_var, basePurchaseUsdt, orderCountInCycle, lbalance) {
    // Aseguramos que los decimales sean correctos
    const profitDecimal = parseNumber(profit_percent) / 100;
    const priceVarDecimal = parseNumber(price_var) / 100;
    const sizeVarDecimal = parseNumber(size_var) / 100;
    const baseAmount = parseNumber(basePurchaseUsdt);
    const count = orderCountInCycle || 0; // Número de órdenes YA ejecutadas (0 = primera orden)
    const balance = parseNumber(lbalance);

    // --- 1. Cálculo del Target de Venta (ltprice) ---
    const targetSellPrice = ppc * (1 + profitDecimal);

    // --- 2. Cálculo del Monto de Cobertura Requerido (monto incremental) ---
    // El monto requerido para la siguiente orden (N+1). Usamos 'count' para calcular el monto del siguiente nivel.
    // Monto de la orden N+1 = Base * (1 + SizeVarDecimal) ^ Count
    let requiredAmount = baseAmount * Math.pow((1 + sizeVarDecimal), count); 

    // Asegurar un monto mínimo
    if (requiredAmount <= 0 || isNaN(requiredAmount)) {
        requiredAmount = baseAmount > 0 ? baseAmount : 0;
    }

    // --- 3. Cálculo del Precio de la Próxima Cobertura (nextCoveragePrice) ---
    // El precio de la siguiente orden es siempre (PPC * (1 - PriceVarDecimal)) porque el PPC se actualiza.
    // Target N+1 = PPC * (1 - PriceVarDecimal)
    const nextCoveragePrice = ppc * (1 - priceVarDecimal);

    // --- 4. Cálculo de la Cobertura Máxima (lcoverage, lNOrderMax) ---
    // Pasamos el monto base (purchaseUsdt) para que calculateLongCoverage evalúe el grid completo.
    const { coveragePrice: lCoveragePrice, numberOfOrders: lNOrderMax } = calculateLongCoverage(
        balance,
        ppc, 
        baseAmount, // ✅ Usar el monto base para calcular el grid completo
        priceVarDecimal,
        sizeVarDecimal
    );

    // --- 5. Retorno de Resultados ---
    return { 
        targetSellPrice, nextCoveragePrice, requiredCoverageAmount: requiredAmount,
        lCoveragePrice, lNOrderMax 
    };
}

/**
 * Calculates the initial state of the bot's parameters.
 */
function calculateInitialState(config, currentPrice) {
    const { long } = config;

    const lbalance = parseNumber(long?.amountUsdt || 0);
    const purchaseUsdt = parseNumber(long?.purchaseUsdt || 0);

    // LONG INITIAL CALCULATIONS
    // PPC inicial es el precio actual (currentPrice) para la primera compra
    const { coveragePrice: lcoverage, numberOfOrders: lnorder } = calculateLongCoverage(
        lbalance,
        currentPrice, // Usamos el precio actual como PPC inicial (punto de ancla)
        purchaseUsdt, // Monto base para la orden N=1 de cobertura
        parseNumber(long.price_var) / 100,
        parseNumber(long.size_var) / 100
    );

    // 🛑 SHORT INITIAL CALCULATIONS (Se mantienen como placeholder)
    const sbalance = parseNumber(config.short?.amountBtc || 0);
    const scoverage = 0;
    const snorder = 0;

    return {
        lstate: 'RUNNING', sstate: 'RUNNING', totalProfit: 0, 
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