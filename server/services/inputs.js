/**
 * BSB/server/services/inputs.js
 * ESTRATEGIA: MALLA ELÁSTICA EXPONENCIAL 2026
 * Sincronizado con: autobotCalculations.js
 */

function processUserInputs(amtL, amtS, amtAI) {
    const l = parseFloat(amtL) || 0;
    const s = parseFloat(amtS) || 0;

    const calculateScalpingGrid = (totalAmount) => {
        // --- PARÁMETROS DE ORO (Fijos para consistencia) ---
        const ABRANGE_TARGET = 20;     // Cobertura total deseada (20%)
        const SIZE_VAR_BOT = 50;       // Enviamos 50 para que el bot haga 1 + (50/100) = 1.5x
        const START_PRICE_VAR = 0.5;   // Primer salto al 0.5%
        const MIN_PURCHASE = 6;        // Calibre mínimo base
        const MAX_LEVELS = 13;         // Límite de seguridad
        const MATH_MULTIPLIER = 1.5;   // Multiplicador interno para proyecciones de capital

        if (totalAmount < 50) return null;

        // 1. DETERMINAR NÚMERO DE NIVELES (N)
        // Calculamos cuántas órdenes de tamaño exponencial caben en el balance
        let n = 0;
        let cumulativeBase = 0;
        let orderBase = MIN_PURCHASE;
        
        while (cumulativeBase + orderBase <= totalAmount && n < MAX_LEVELS) {
            cumulativeBase += orderBase;
            n++;
            orderBase *= MATH_MULTIPLIER;
        }

        if (n < 3) return null; // Mínimo de seguridad para operar

        // 2. AJUSTAR EL PURCHASE (CALIBRE DINÁMICO)
        // Si sobra dinero entre niveles, engrosamos el First Buy
        let purchase = MIN_PURCHASE;
        for (let p = MIN_PURCHASE; p <= 100; p += 0.1) {
            let testSum = 0; 
            let testOrd = p;
            for (let i = 0; i < n; i++) {
                testSum += testOrd;
                testOrd *= MATH_MULTIPLIER;
            }
            if (testSum <= totalAmount) {
                purchase = p;
            } else {
                break;
            }
        }

        // 3. CALCULAR EL INCREMENTO EXPONENCIAL (Price Step Inc)
        // Resolvemos para que la suma de saltos exponenciales toque el 20%.
        // El bot usa: Step_i = Start * (1 + Inc/100)^i
        let stepInc = 0;
        if (n > 1) {
            // Fórmula de ajuste fino para la curva Math.pow del bot
            // Buscamos el incremento que estire la malla hasta el Abrange
            let targetRatio = ABRANGE_TARGET / (START_PRICE_VAR * n);
            // El factor 0.65 compensa la aceleración de la potencia en el bot
            stepInc = (Math.pow(targetRatio, 1 / (n * 0.65)) - 1) * 100;
        }

        // 4. RETORNO DE CONFIGURACIÓN ESTÁNDAR
        return {
            amountUsdt: parseFloat(totalAmount.toFixed(2)),
            purchaseUsdt: parseFloat(purchase.toFixed(2)),
            price_var: START_PRICE_VAR,
            price_step_inc: parseFloat(stepInc.toFixed(1)), // El "estirador" de la malla
            size_var: SIZE_VAR_BOT,                          // El "multiplicador" (150% real)
            profit_percent: 1.3,                             // Salida con Trailing 0.3 (Neto 1%)
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

module.exports = { processUserInputs };