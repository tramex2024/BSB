/**
 * BSB/server/services/inputs.js
 * Lógica Dual: Scalping (<100) y Blindaje 40/15 (>=100)
 */

function processUserInputs(amtL, amtS, amtAI) {
    const l = parseFloat(amtL) || 0;
    const s = parseFloat(amtS) || 0;

    const calculateShield = (totalAmount) => {
        const minOrder = 6;

        // --- ESTRATEGIA A: CAPITAL BAJO (< 100 USDT) ---
        // Objetivo: Cobertura del 15%, menos órdenes, salida rápida.
        if (totalAmount < 100) {
            return {
                amountUsdt: totalAmount,
                purchaseUsdt: minOrder,
                price_var: 0.8,      // Distancia más amplia entre órdenes
                price_step_inc: 0.2, // Incremento suave para cubrir el 15% rápido
                size_var: 1.1,       // Multiplicador bajo para estirar los pocos USD
                profit_percent: 1.3  // Profit más corto para asegurar ganancias
            };
        }

        // --- ESTRATEGIA B: BLINDAJE PROFESIONAL (>= 100 USDT) ---
        // Objetivo: Cobertura del 40%, 15 órdenes, promediado dinámico.
        const n = 15; 
        
        // Fórmula del "Acordeón": Ajusta el multiplicador según el capital
        // Para 100 USD será ~1.03 | Para 350 USD ~1.18 | Para 1000 USD ~1.33
        let sVar = Math.pow((totalAmount / minOrder), 1 / (n - 1.5));
        sVar = parseFloat(Math.min(1.8, Math.max(1.02, sVar)).toFixed(2));

        return {
            amountUsdt: totalAmount,
            purchaseUsdt: minOrder,
            price_var: 0.6,
            price_step_inc: 0.32, // Garantiza el ~40% de profundidad en 15 niveles
            size_var: sVar,
            profit_percent: 1.3
        };
    };

    return {
        long: calculateShield(l),
        short: calculateShield(s),
        ai: { amountUsdt: amtAI }
    };
}

module.exports = { processUserInputs };