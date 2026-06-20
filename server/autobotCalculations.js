/**
 * ARCHIVO COMPLETO: autobotCalculations.js
 * Lógica Exponencial Pura con Cobertura Compuesta del 18% y Absorción del Excedente
 */

/**
 * CALCULO GEOMÉTRICO DE TAMAÑOS (Reglas 1, 2, 3, 4 y 7)
 * Distribuye uniformemente todo el capital modificando la tasa de crecimiento global.
 * @param {number} totalAmount - Capital total asignado a la grilla
 */
function calculateDistributedSizes(totalAmount) {
    const amount = parseFloat(totalAmount);
    if (amount < 42.00) return null; // Capital mínimo para operar (Regla 6)
    
    // 1. Determinar el número máximo de niveles (n) usando multiplicador base 2
    let n = 1;
    while (n < 10) { // Límite estricto de 10 niveles (Regla 4)
        let nextSum = 6.00 * (Math.pow(2.0, n + 1) - 1);
        if (nextSum > amount) break;
        n++;
    }
    
    let low = 2.0;
    let high = amount;
    let r = 2.0;
    
    // 2. Buscador binario para ajustar el multiplicador de tamaño (r) y absorber el excedente (Regla 7)
    if (n > 1) {
        for (let i = 0; i < 60; i++) {
            let mid = (low + high) / 2;
            let sumGeo = 6.00 * (Math.pow(mid, n) - 1) / (mid - 1);
            if (sumGeo < amount) {
                low = mid;
            } else {
                high = mid;
            }
        }
        r = (low + high) / 2;
    }
    
    // 3. Generar la serie geométrica pura de tamaños
    let finalSizes = [];
    for (let i = 0; i < n; i++) {
        finalSizes.push(6.00 * Math.pow(r, i)); // Regla 1 (Base 6) y Regla 3 (Exponencial)
    }
    
    // 4. Redondeo a 2 decimales y ajuste de céntimos finales por precisión matemática
    let roundedSizes = finalSizes.map(s => parseFloat(s.toFixed(2)));
    let sumRounded = roundedSizes.reduce((a, b) => a + b, 0);
    let delta = amount - sumRounded;
    roundedSizes[roundedSizes.length - 1] = parseFloat((roundedSizes[roundedSizes.length - 1] + delta).toFixed(2));
    
    return {
        levels: n,
        sizeMultiplier: parseFloat(r.toFixed(4)),
        sizes: roundedSizes
    };
}

/**
 * CALCULO DINÁMICO DE PASOS COMPUESTOS (Reglas 8 y 9)
 * Encuentra el multiplicador exacto para garantizar el 18% de cobertura de mercado.
 * @param {number} levels - Número de niveles (n)
 */
function calculateStepGrow(levels) {
    const n = parseInt(levels);
    const numSteps = n - 1; // n niveles tienen exactamente n-1 saltos de precio
    if (numSteps <= 0) return 1.0;

    const TARGET_COVERAGE = 0.18; // 18% de cobertura objetivo (Regla 9)
    const START_STEP = 0.015;     // 1.5% primer salto de precio (Regla 8)
    
    let low = 0.1;
    let high = 5.0; // Rango elástico seguro para el buscador
    
    for (let i = 0; i < 60; i++) {
        let mid = (low + high) / 2;
        let prod = 1.0;
        let invalid = false;
        
        // Simular la multiplicación compuesta real de la grilla de precios
        for (let j = 0; j < numSteps; j++) {
            let step = START_STEP * Math.pow(mid, j);
            if (step >= 1.0) { // Protección matemática contra caídas > 100%
                invalid = true;
                break;
            }
            prod *= (1.0 - step);
        }
        
        if (invalid) {
            high = mid; // Multiplicador demasiado agresivo, reduce el límite superior
            continue;
        }
        
        let actualCoverage = 1.0 - prod;
        
        if (actualCoverage < TARGET_COVERAGE) {
            low = mid; // Falta cobertura, necesitamos pasos más amplios
        } else {
            high = mid; // Sobra cobertura, reducimos los pasos
        }
    }
    
    return parseFloat(((low + high) / 2).toFixed(4));
}

/**
 * SIMULADOR COMPLETO DE GRILLA (Para Generar Órdenes Listas para API)
 * @param {number} amount - Capital total de la grilla
 * @param {number} initialPrice - Precio de la primera entrada (Orden 1)
 * @param {string} side - Tipo de operación: 'long' o 'short'
 */
function generateAutobotGrid(amount, initialPrice, side = 'long') {
    const sizeData = calculateDistributedSizes(amount);
    if (!sizeData) return null;
    
    const n = sizeData.levels;
    const sizes = sizeData.sizes;
    const gridStepMultiplier = calculateStepGrow(n);
    
    let orders = [];
    let currentPrice = parseFloat(initialPrice);
    
    // Primera orden: Siempre va al precio inicial de mercado (Regla 1)
    orders.push({
        orderNumber: 1,
        sizeUSDT: sizes[0],
        price: parseFloat(currentPrice.toFixed(2)),
        distanceFromPrevious: "0.00%"
    });
    
    // Generar el resto de niveles compuestos (Órdenes 2 hasta N)
    const START_STEP = 0.015;
    for (let i = 1; i < n; i++) {
        // El paso actual crece exponencialmente con base en la orden ejecutada anterior (i - 1)
        let currentStep = START_STEP * Math.pow(gridStepMultiplier, i - 1);
        
        if (side.toLowerCase() === 'long') {
            currentPrice = currentPrice * (1.0 - currentStep);
        } else {
            currentPrice = currentPrice * (1.0 + currentStep);
        }
        
        orders.push({
            orderNumber: i + 1,
            sizeUSDT: sizes[i],
            price: parseFloat(currentPrice.toFixed(2)),
            distanceFromPrevious: (currentStep * 100).toFixed(2) + "%"
        });
    }
    
    // Calcular métricas finales de control
    const totalCoverage = Math.abs((initialPrice - currentPrice) / initialPrice) * 100;
    
    return {
        totalAmountAllocated: amount,
        totalLevels: n,
        sizeMultiplier: sizeData.sizeMultiplier,
        priceStepMultiplier: gridStepMultiplier,
        realCoveragePct: totalCoverage.toFixed(2) + "%",
        orders: orders
    };
}

// Exportar funciones para NodeJS / Jest / Suite de pruebas
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateLongCoverage,    // 👈 ¡Esta debe estar aquí declarada exactamente así!
        calculateShortCoverage,   // 👈 ¡Y esta también!
        calculatePotentialProfit,
        calculateDistributedSizes,
        calculateStepGrow,
        generateAutobotGrid
    };
}