/**
 * BSB/server/services/inputs.js
 * Orquestador de Estrategias - PCC IMÁN (Multiplicador 1.5 Garantizado)
 */

function processUserInputs(amtL, amtS, amtAI) {
    const l = parseFloat(amtL) || 0;
    const s = parseFloat(amtS) || 0;

    const calculateShield = (totalAmount) => {
        const minOrder = 6;

        // --- ESTRATEGIA C (CAPITAL LIMITADO): < 193 USDT ---
        // Mantenemos el multiplicador 1.5 para no alejar el PCC,
        // pero reducimos niveles para ajustar al balance.
        if (totalAmount < 193) {
            return {
                amountUsdt: totalAmount,
                purchaseUsdt: minOrder,
                price_var: 0.8,
                price_step_inc: 0.15, 
                size_var: 1.5,         // PROTEGIDO: No baja de 1.5
                profit_percent: 1.1,
                levels: 5              // Menos niveles porque hay menos capital
            };
        }

        // --- ESTRATEGIA A (POWER-SCALPER): 193 USDT - 500 USDT ---
        // Objetivo: Cobertura 10%, 7 niveles, PCC pegado al precio.
        if (totalAmount >= 193 && totalAmount < 500) {
            return {
                amountUsdt: totalAmount,
                purchaseUsdt: minOrder,
                price_var: 0.8,        
                price_step_inc: 0.15,   // Step Grow 1.15
                size_var: 1.5,         // PROTEGIDO: Garantiza atracción del PCC
                profit_percent: 1.1,
                levels: 7              
            };
        }

        // --- ESTRATEGIA B (ANÁLISIS PENDIENTE): >= 500 USDT ---
        // Por ahora lo dejamos como reserva, pero siguiendo tu regla,
        // cualquier evolución aquí deberá respetar el size_var >= 1.5.
        return {
            amountUsdt: totalAmount,
            purchaseUsdt: minOrder,
            price_var: 0.6,
            price_step_inc: 0.32,
            size_var: 1.5,             // Ajustado a 1.5 para mantener coherencia
            profit_percent: 1.3,
            levels: 10
        };
    };

    return {
        long: calculateShield(l),
        short: calculateShield(s),
        ai: { amountUsdt: amtAI }
    };
}

module.exports = { processUserInputs };