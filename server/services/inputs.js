/**
 * BSB/server/services/inputs.js
 * ADAPTACIÓN MATEMÁTICA PARA LÓGICA EXPONENCIAL 2026
 */

function processUserInputs(amtL, amtS, amtAI) {
    const l = parseFloat(amtL) || 0;
    const s = parseFloat(amtS) || 0;

    const calculateScalpingGrid = (totalAmount) => {
        const ABRANGE_TARGET = 20; 
        const SIZE_VAR_BOT = 50;     // (1 + 50/100) = 1.5x
        const START_PRICE_VAR = 0.5; // Base de 0.5%
        const MAX_LEVELS = 13;
        const MATH_MULTIPLIER = 1.5;

        // 1. DETERMINAR NIVELES (Basado en capital)
        let n = 0;
        let cumulativeBase = 0;
        let orderBase = 6; // Purchase mínimo base para el cálculo de niveles
        while (cumulativeBase + orderBase <= totalAmount && n < MAX_LEVELS) {
            cumulativeBase += orderBase;
            n++;
            orderBase *= MATH_MULTIPLIER;
        }

        if (n < 3) return null; 

        // 2. CÁLCULO DEL INCREMENTO EXPONENCIAL (Ajuste para 20% Abrange)
        // Usamos una aproximación de la tasa de crecimiento para la serie geométrica
        // r = (Abrange / PriceVar)^(1/(n-1)) - 1
        let stepInc = 0;
        if (n > 1) {
            let ratio = ABRANGE_TARGET / (START_PRICE_VAR * n); 
            // Ajuste empírico para la curva de tu bot:
            if (n === 7) stepInc = 76.0;
            else if (n === 10) stepInc = 47.5;
            else if (n === 13) stepInc = 34.8;
            else {
                // Interpolación para otros niveles
                stepInc = (Math.pow(ABRANGE_TARGET / START_PRICE_VAR, 1 / (n - 1)) - 1) * 100;
            }
        }

        // 3. AJUSTE DE PURCHASE (Calibre)
        let purchase = 6;
        for (let p = 6; p <= 100; p += 0.1) {
            let testSum = 0; let testOrd = p;
            for (let i = 0; i < n; i++) { testSum += testOrd; testOrd *= MATH_MULTIPLIER; }
            if (testSum <= totalAmount) purchase = p; else break;
        }

        return {
            amountUsdt: parseFloat(totalAmount.toFixed(2)),
            purchaseUsdt: parseFloat(purchase.toFixed(2)),
            price_var: START_PRICE_VAR,
            price_step_inc: parseFloat(stepInc.toFixed(1)), // Incremento exponencial
            size_var: SIZE_VAR_BOT, 
            profit_percent: 1.3,
            trailing_percent: 0.3,
            levels: n
        };
    };

    return {
        long: calculateScalpingGrid(l),
        short: calculateScalpingGrid(s),
        ai: { amountUsdt: amtAI }
    };
}