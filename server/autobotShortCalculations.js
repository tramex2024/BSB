/**
 * BSB/server/autobotShortCalculations.js (SOLO LÓGICA SHORT)
 */

// Importamos la función helper de Long/Común para consistencia
const { parseNumber } = require('../../utils/helpers'); // Asumiendo que el path es correcto 

// -------------------------------------------------------------------------
// LÓGICA DE COBERTURA (SHORT)
// -------------------------------------------------------------------------

/**
 * Calcula la cobertura de precio (SCoverage) y número de órdenes (SNOrder) para Short.
 * La cobertura Short ocurre cuando el precio SUBE.
 * * @param {number} sbalance - El balance de BTC disponible para DCA (la moneda base).
 * @param {number} currentPrice - El precio actual de la moneda.
 * @param {number} sellBtc - La cantidad base de BTC a vender (para la siguiente orden).
 * @param {number} decrement - El porcentaje de variación de precio para la próxima orden (ej. 0.01).
 * @param {number} increment - El porcentaje de incremento de tamaño de orden (ej. 0.05).
 */
function calculateShortCoverage(sbalance, currentPrice, sellBtc, decrement, increment) {
    let currentBalance = parseNumber(sbalance);
    let nextOrderPrice = parseNumber(currentPrice);
    let nextOrderAmount = parseNumber(sellBtc);
    let numberOfOrders = 0;
    let coveragePrice = nextOrderPrice;

    // Primer chequeo para la orden inicial (Venta)
    if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) {
        currentBalance -= nextOrderAmount;
        numberOfOrders++;
        
        // El precio de la próxima orden de DCA (Venta) es más ALTO que la actual
        coveragePrice = nextOrderPrice * (1 + decrement); 
        
        while (true) {
            // El precio de la siguiente orden de DCA se calcula con el INCREMENTO (DCA UP)
            nextOrderPrice = nextOrderPrice * (1 + decrement); 
            // El tamaño de la orden aumenta
            nextOrderAmount = nextOrderAmount * (1 + increment);

            if (currentBalance >= nextOrderAmount && nextOrderAmount > 0) {
                currentBalance -= nextOrderAmount;
                numberOfOrders++;
                // El precio de la última orden cubierta es el precio de cobertura
                coveragePrice = nextOrderPrice * (1 + decrement); 
            } else {
                // Si el balance no es suficiente, el precio de la próxima orden fallida es el precio de cobertura
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
// LÓGICA DE TARGETS POST-VENTA (SHORT)
// -------------------------------------------------------------------------

/**
 * Calcula los targets de Cierre/TP (Compra) y Cobertura (Venta DCA) después de una venta (SHORT).
 * * @param {number} ppc - Precio Promedio de Venta (PPC Short).
 * @param {number} profit_percent - Porcentaje de ganancia deseado (ej. 0.005).
 * @param {number} price_var - Variación de precio para la próxima cobertura (ej. 0.003).
 * @param {number} size_var - Incremento de tamaño de orden (ej. 0.05).
 * @param {number} baseSellBtc - Cantidad base de BTC a vender/cubrir.
 * @param {number} orderCountInCycle - Número de órdenes de VENTA (posiciones abiertas) en el ciclo.
 * @param {number} sbalance - Balance de BTC disponible para DCA.
 */
function calculateShortTargets(ppc, profit_percent, price_var, size_var, baseSellBtc, orderCountInCycle, sbalance) {
    const profitDecimal = parseNumber(profit_percent) / 100;
    const priceVarDecimal = parseNumber(price_var) / 100;
    const sizeVarDecimal = parseNumber(size_var) / 100;
    const baseAmount = parseNumber(baseSellBtc);
    const count = orderCountInCycle || 0;
    const balance = parseNumber(sbalance);

    // 1. Target de Cierre/TP (COMPRA)
    // El precio de compra debe ser MENOR que el PPC Short para obtener ganancia.
    const targetBuyPrice = ppc * (1 - profitDecimal); 

    // 2. Monto y Precio de la Siguiente Cobertura (VENTA DCA UP)
    // El monto aumenta con el tamaño de DCA, igual que Long.
    const requiredCoverageAmount = baseAmount * Math.pow((1 + sizeVarDecimal), count); 
    
    // El precio de la siguiente cobertura es MÁS ALTO que el PPC Short.
    const nextCoveragePrice = ppc * (1 + priceVarDecimal); 

    // 3. Cálculo de la Cobertura Máxima Restante
    const { coveragePrice: sCoveragePrice, numberOfOrders: sNOrderMax } = calculateShortCoverage(
        balance,
        ppc, // Usamos el PPC como punto de partida para este cálculo interno
        requiredCoverageAmount,
        priceVarDecimal,
        sizeVarDecimal
    );
    
    // Si el capital no es suficiente para la siguiente orden de DCA
    if(requiredCoverageAmount > balance){
        return { 
            targetBuyPrice, nextCoveragePrice, 
            requiredCoverageAmount: 0,
            sCoveragePrice: nextCoveragePrice, 
            sNOrderMax: 0 
        };
    }
    
    return { 
        targetBuyPrice, nextCoveragePrice, requiredCoverageAmount,
        sCoveragePrice, sNOrderMax 
    };
}


module.exports = {
    calculateShortCoverage,
    calculateShortTargets,
};