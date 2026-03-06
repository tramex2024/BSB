/**
 * BSB/server/services/inputs.js
 * Corrección de Formato: Multiplicador en Porcentaje (150)
 */

function processUserInputs(amtL, amtS, amtAI) {
    const l = parseFloat(amtL) || 0;
    const s = parseFloat(amtS) || 0;

    const calculateScalpingGrid = (totalAmount) => {
        const ABRANGE = 20; 
        const SIZE_VAR_PERCENT = 150; // <--- CORREGIDO: 150% en lugar de 1.5
        const START_PRICE_VAR = 0.5;
        const MIN_PURCHASE = 6;
        const MAX_LEVELS = 13; 
        
        if (totalAmount < 50) return null;

        // 1. DETERMINAR NIVELES (Usamos 1.5 para el cálculo matemático interno)
        let n = 0;
        let cumulativeBase = 0;
        let orderBase = MIN_PURCHASE;
        const MATH_MULTIPLIER = 1.5; 
        
        while (cumulativeBase + orderBase <= totalAmount && n < MAX_LEVELS) {
            cumulativeBase += orderBase;
            n++;
            orderBase *= MATH_MULTIPLIER;
        }

        // 2. AJUSTAR PURCHASE (Amortiguador decimal)
        let purchase = MIN_PURCHASE;
        for (let p = MIN_PURCHASE; p <= 100; p += 0.1) {
            let testCumulative = 0;
            let testOrder = p;
            for (let i = 0; i < n; i++) {
                testCumulative += testOrder;
                testOrder *= MATH_MULTIPLIER;
            }
            if (testCumulative <= totalAmount) {
                purchase = p;
            } else {
                break;
            }
        }

        // 3. REPARTO DEL 20%
        let stepInc = n > 1 ? (ABRANGE - START_PRICE_VAR) / (n - 1) : ABRANGE;

        return {
            amountUsdt: parseFloat(totalAmount.toFixed(2)),
            purchaseUsdt: parseFloat(purchase.toFixed(2)),
            price_var: START_PRICE_VAR,
            price_step_inc: parseFloat(stepInc.toFixed(2)),
            size_var: SIZE_VAR_PERCENT, // Enviamos "150" a la App
            profit_percent: 1.3,        // Trigger al 1.3%
            trailing_percent: 0.3,      // Trailing del 0.3% (Neto 1%)
            levels: n
        };
    };

    return {
        long: calculateScalpingGrid(l),
        short: calculateScalpingGrid(s),
        ai: { amountUsdt: amtAI }
    };
}

module.exports = { processUserInputs };