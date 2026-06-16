/**
 * BSB/server/services/inputs.js
 * ESTRATEGIA: REMANENTE DISTRIBUIDO EXPONENCIAL
 */

const { 
    calculateDistributedSizes, 
    calculateStepGrow 
} = require('../autobotCalculations');

function processUserInputs(amtL, amtS, amtAI, existingConfig = {}) {
    const MAX_CAP = 6140.0; // Regla 6
    const l = Math.min(parseFloat(amtL) || 0, MAX_CAP);
    const s = Math.min(parseFloat(amtS) || 0, MAX_CAP);

    const calculateScalpingGrid = (totalAmount, side) => {
        const sizes = calculateDistributedSizes(totalAmount);
        if (!sizes || sizes.length < 3) return null; // Mínimo 42.00 USDT genera 3 niveles

        const n = sizes.length;
        const stepInc = calculateStepGrow(n); 
        const sizeMultiplier = sizes[1] / sizes[0]; 
        
        return {
            amountUsdt: parseFloat(totalAmount.toFixed(2)),
            purchaseUsdt: 6.0, // Regla 1
            price_var: 0.015, // Regla 8: 1.5% inicial en formato estándar multiplicador
            price_step_inc: parseFloat(stepInc.toFixed(4)), // CORREGIDO NOMBRE (Antes gridStepMultiplier)
            size_var: parseFloat(sizeMultiplier.toFixed(4)), // CORREGIDO NOMBRE (Antes sizeMultiplier)
            profit_percent: 0.013, // Convertido a estándar decimal (1.3%)
            trailing_percent: 0.003, // Convertido a estándar decimal (0.3%)
            levels: n,
            stopAtCycle: existingConfig[side]?.stopAtCycle || false
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