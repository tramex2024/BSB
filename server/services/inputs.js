/**
 * BSB/server/services/inputs.js
 * Lógica de Malla Elástica - Versión Final Optimizada
 * Límites: 13 Niveles | $50 - $2500 USDT | Abrange 20%
 */

function processUserInputs(amtL, amtS, amtAI) {
    const l = parseFloat(amtL) || 0;
    const s = parseFloat(amtS) || 0;

    const calculateScalpingGrid = (totalAmount) => {
        // --- PARÁMETROS DE ORO ---
        const ABRANGE = 20; 
        const SIZE_VAR = 1.5; 
        const START_PRICE_VAR = 0.5;
        const MIN_PURCHASE = 6;
        const MAX_LEVELS = 13; // Límite técnico definido para eficiencia
        
        if (totalAmount < 50) return null; // Balance insuficiente para la estrategia

        // 1. DETERMINAR NÚMERO DE NIVELES (Máximo 13)
        let n = 0;
        let cumulativeBase = 0;
        let orderBase = MIN_PURCHASE;
        
        while (cumulativeBase + orderBase <= totalAmount && n < MAX_LEVELS) {
            cumulativeBase += orderBase;
            n++;
            orderBase *= SIZE_VAR;
        }

        // 2. AJUSTAR PURCHASE (Amortiguador de capital sobrante)
        // Buscamos el purchase (P) más alto que encaje en 'n' niveles con el totalAmount
        let purchase = MIN_PURCHASE;
        let foundPurchase = false;
        
        // Iteramos para encontrar el purchase óptimo (6, 7, 8... hasta que el totalAmount lo permita)
        for (let p = MIN_PURCHASE; p <= 100; p += 0.1) { // Paso decimal para máxima precisión
            let testCumulative = 0;
            let testOrder = p;
            for (let i = 0; i < n; i++) {
                testCumulative += testOrder;
                testOrder *= SIZE_VAR;
            }
            if (testCumulative <= totalAmount) {
                purchase = p;
            } else {
                break;
            }
        }

        // 3. CALCULAR EL PRICE STEP (Reparto dinámico del 20%)
        // Con n=13, el salto entre órdenes será de ~1.62%
        let stepInc = n > 1 ? (ABRANGE - START_PRICE_VAR) / (n - 1) : ABRANGE;

        return {
            amountUsdt: parseFloat(totalAmount.toFixed(2)),
            purchaseUsdt: parseFloat(purchase.toFixed(2)),
            price_var: START_PRICE_VAR,
            price_step_inc: parseFloat(stepInc.toFixed(2)),
            size_var: SIZE_VAR,
            profit_percent: 1.1,
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