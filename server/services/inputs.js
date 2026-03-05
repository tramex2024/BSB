/**
 * BSB/server/services/inputs.js
 * Lógica de Malla Infinita con Amortiguación de Purchase
 * Prioridad: Máxima densidad de órdenes para 20% Abrange.
 */

function processUserInputs(amtL, amtS, amtAI) {
    const l = parseFloat(amtL) || 0;
    const s = parseFloat(amtS) || 0;

    const calculateScalpingGrid = (totalAmount) => {
        const ABRANGE = 20; 
        const SIZE_VAR = 1.5; 
        const START_PRICE_VAR = 0.5;
        const MIN_PURCHASE = 6;
        const MAX_PURCHASE = 20; // Límite de seguridad para el calibre

        // 1. DETERMINAR MÁXIMO DE NIVELES (con purchase base de 6)
        let n = 0;
        let cumulativeBase = 0;
        let orderBase = MIN_PURCHASE;
        
        // Calculamos cuántos niveles caben con el mínimo purchase
        while (cumulativeBase + orderBase <= totalAmount) {
            cumulativeBase += orderBase;
            n++;
            orderBase *= SIZE_VAR;
        }

        // 2. AJUSTAR PURCHASE (Amortiguar el capital sobrante)
        // Intentamos subir el purchase (6, 7, 8...) para que las 'n' órdenes 
        // aprovechen el capital disponible sin excederlo.
        let purchase = MIN_PURCHASE;
        for (let p = MIN_PURCHASE + 1; p <= MAX_PURCHASE; p++) {
            let testCumulative = 0;
            let testOrder = p;
            for (let i = 0; i < n; i++) {
                testCumulative += testOrder;
                testOrder *= SIZE_VAR;
            }
            
            if (testCumulative <= totalAmount) {
                purchase = p; // Si cabe con purchase P, lo aceptamos
            } else {
                break; // Si ya no cabe, nos quedamos con el anterior
            }
        }

        // 3. CALCULAR EL PRICE STEP (Reparto dinámico del 20%)
        let stepInc = n > 1 ? (ABRANGE - START_PRICE_VAR) / (n - 1) : ABRANGE;

        return {
            amountUsdt: totalAmount,
            purchaseUsdt: purchase,
            price_var: START_PRICE_VAR,
            price_step_inc: parseFloat(stepInc.toFixed(2)),
            size_var: SIZE_VAR,
            profit_percent: 1.3,
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