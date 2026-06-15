/**
 * BSB/server/services/inputs.js
 * ESTRATEGIA: REMANENTE DISTRIBUIDO (Refactorizada a Factores Estándar)
 */

const { 
    calculateDistributedSizes, 
    calculateStepGrow 
} = require('../autobotCalculations');

function processUserInputs(amtL, amtS, amtAI, existingConfig = {}) {
    const MAX_CAP = 6140.0;
    const l = Math.min(parseFloat(amtL) || 0, MAX_CAP);
    const s = Math.min(parseFloat(amtS) || 0, MAX_CAP);

    const calculateScalpingGrid = (totalAmount, side) => {
        const sizes = calculateDistributedSizes(totalAmount);
        if (!sizes || sizes.length < 3) return null;

        const n = sizes.length;
        // stepInc sigue siendo un factor (ej. 1.05)
        const stepInc = calculateStepGrow(n);
        
        // REFACTOR: Ahora es un factor, no un porcentaje. 
        // Ejemplo: Si sizes[1] es 1.5 veces sizes[0], el factor es 1.5
        const sizeMultiplier = sizes[1] / sizes[0]; 
        const prevStopAtCycle = existingConfig[side]?.stopAtCycle || false;

        return {
            amountUsdt: parseFloat(totalAmount.toFixed(2)),
            purchaseUsdt: 6.0, 
            price_var: 1.5, // Mantener como factor (ej. 1.5% -> 0.015, pero si tu motor espera el número, mantenlo)
            gridStepMultiplier: parseFloat(stepInc.toFixed(4)), // Renombrado de price_step_inc
            sizeMultiplier: parseFloat(sizeMultiplier.toFixed(4)), // Renombrado de size_var
            profit_percent: 1.3,
            trailing_percent: 0.3,
            levels: n,
            stopAtCycle: prevStopAtCycle
        };
    };

    return {
        long: calculateScalpingGrid(l, 'long'),
        short: calculateScalpingGrid(s, 'short'),
        ai: { 
            amountUsdt: amtAI,
            stopAtCycle: existingConfig.ai?.stopAtCycle || false 
        }
    };
}

/**
 * Procesa y limpia los inputs manuales del modo Advanced
 */
function processAdvancedInputs(data) {
    if (!data) return null;
    return {
        amountUsdt: data.amountUsdt !== undefined ? parseFloat(data.amountUsdt) : undefined,
        purchaseUsdt: data.purchaseUsdt !== undefined ? parseFloat(data.purchaseUsdt) : undefined,
        price_var: data.price_var !== undefined ? parseFloat(data.price_var) : undefined,
        size_var: data.size_var !== undefined ? parseFloat(data.size_var) : undefined,
        profit_percent: data.profit_percent !== undefined ? parseFloat(data.profit_percent) : undefined,
        price_step_inc: data.price_step_inc !== undefined ? parseFloat(data.price_step_inc) : undefined,
        stopAtCycle: data.stopAtCycle !== undefined ? !!data.stopAtCycle : undefined
    };
}

/**
 * Procesa la configuración específica para el bot de Inteligencia Artificial
 */
function processAIInputs(amtAI, existingAIConfig = {}) {
    const amount = parseFloat(amtAI) || 0;
    const minAI = 20.0; 
    const finalAmount = amount < minAI ? minAI : amount;

    return {
        amountUsdt: parseFloat(finalAmount.toFixed(2)),
        stopAtCycle: !!existingAIConfig.stopAtCycle 
    };
}

module.exports = { 
    processUserInputs,
    processAdvancedInputs, 
    processAIInputs 
};