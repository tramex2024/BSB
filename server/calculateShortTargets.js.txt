/**
 * Calcula los objetivos de Venta (Take Profit) y Compra (Cobertura/DCA) para la estrategia Short.
 * La lógica es INVERSA a la Long: Se espera que el precio CAIGA para obtener ganancias.
 * Se espera que el precio SUBA para necesitar cobertura.
 *
 * @param {number} currentPPC - Precio Promedio de Cierre (PPC) actual de la posición (USD).
 * @param {number} profitPercent - Porcentaje de beneficio objetivo (ej. 1.5).
 * @param {number} priceVar - Porcentaje de variación de precio para la siguiente cobertura (ej. 0.8).
 * @param {number} sizeVar - Multiplicador de la cantidad para la siguiente orden de cobertura (ej. 1.1).
 * @param {number} initialAmountBtc - Cantidad inicial de BTC usada para la primera orden (BTC).
 * @param {number} orderCountInCycle - Número de órdenes de venta (Short) ejecutadas hasta ahora.
 * @param {number} sBalance - Capital BTC restante para las órdenes de cobertura Short.
 * @returns {object} Con los nuevos targets y parámetros de cobertura.
 */
function calculateShortTargets(
    currentPPC, 
    profitPercent, 
    priceVar, 
    sizeVar, 
    initialAmountBtc, 
    orderCountInCycle, 
    sBalance
) {
    // Convertir porcentajes a decimales
    const profitMultiplier = profitPercent / 100;
    const priceVarMultiplier = priceVar / 100;

    // --- 1. CÁLCULO DEL TARGET DE CIERRE (Take Profit) ---
    // En Short, el TP está por debajo del PPC.
    // Fórmula: PPC * (1 - % de Ganancia)
    const targetBuyPrice = currentPPC * (1 - profitMultiplier);
    
    // --- 2. CÁLCULO DE LA PRÓXIMA COBERTURA (DCA) ---
    // En Short, la cobertura se activa cuando el precio SUBE.
    // Fórmula: PPC * (1 + % de Variación)
    const nextCoveragePrice = currentPPC * (1 + priceVarMultiplier);

    // --- 3. CÁLCULO DE LA CANTIDAD DE COBERTURA ---
    // La cantidad de BTC a vender en corto (orden de cobertura).
    // Usa el multiplicador de tamaño (sizeVar) si la orden no es la primera.
    let requiredCoverageAmountBtc;
    
    if (orderCountInCycle === 0) {
        // Primera orden: El monto es fijo (aunque esta lógica ya no debería usarse aquí, es una red de seguridad)
        requiredCoverageAmountBtc = initialAmountBtc;
    } else {
        // Órdenes de cobertura: Se usa el monto inicial y se aplica el multiplicador
        // Fórmula: Monto Inicial * (sizeVar ^ orderCountInCycle)
        requiredCoverageAmountBtc = initialAmountBtc * (sizeVar ** orderCountInCycle);
    }
    
    // --- 4. CÁLCULO DEL LÍMITE DE COBERTURA (S-Coverage) ---
    // El límite máximo de órdenes (basado en el balance BTC restante).
    let sNOrderMax = 0;
    let accumulatedBtc = 0;
    let tempBalance = sBalance;
    let n = orderCountInCycle;

    // Iteramos para simular cuántas órdenes más puede colocar el bot hasta agotar el sBalance
    while (tempBalance >= 0) {
        const nextOrderSize = initialAmountBtc * (sizeVar ** n);
        
        if (tempBalance >= nextOrderSize) {
            tempBalance -= nextOrderSize;
            accumulatedBtc += nextOrderSize;
            sNOrderMax++;
            n++;
        } else {
            // No hay suficiente balance para la próxima orden
            break; 
        }
    }
    // El S-Coverage es el precio promedio si todas las órdenes posibles se ejecutaran.
    // Calculamos el precio de la última orden posible para estimar el riesgo.
    const lastPossiblePrice = currentPPC * (1 + (priceVarMultiplier * (n - orderCountInCycle))); // Fórmula simplificada.
    
    // El sCoveragePrice es el límite al que el bot ya no podrá promediar más.
    const sCoveragePrice = lastPossiblePrice;

    return {
        targetBuyPrice, // Objetivo de Cierre (Precio más bajo)
        nextCoveragePrice, // Precio de la próxima Cobertura (Precio más alto)
        requiredCoverageAmountBtc, // Cantidad de BTC a vender en la próxima cobertura
        sCoveragePrice, // Precio límite (máximo) de la cobertura antes de agotarse el BTC.
        sNOrderMax // Número de órdenes restantes posibles.
    };
}

// Asegúrate de exportar ambas funciones
module.exports = { 
    calculateLongTargets, 
    calculateShortTargets 
};