/**
 * BSB/server/services/inputs.js
 * Lógica de Blindaje Automático (40%) alineada con el Modelo MongoDB
 */

function processUserInputs(amtL, amtS, amtAI) {
    const l = parseFloat(amtL) || 6;
    const s = parseFloat(amtS) || 6;
    const ai = parseFloat(amtAI) || 10;

    const SHIELD_RATIO = 0.40; 

    return {
        long: {
            amountUsdt: l,
            purchaseUsdt: Math.max(6, parseFloat((l * SHIELD_RATIO).toFixed(2))),
            price_var: 0.5,       // Alineado con default modelo
            size_var: 55,        // Alineado con default modelo
            price_step_inc: 35,  // Según tu ejemplo
            profit_percent: 1.3  // Según tu ejemplo
        },
        short: {
            amountUsdt: s,
            purchaseUsdt: Math.max(6, parseFloat((s * SHIELD_RATIO).toFixed(2))),
            price_var: 0.5,
            size_var: 55,
            price_step_inc: 35,
            profit_percent: 1.3
        },
        ai: {
            amountUsdt: ai,
            // La IA en tu modelo solo tiene amountUsdt y stopAtCycle
        }
    };
}

module.exports = { processUserInputs };