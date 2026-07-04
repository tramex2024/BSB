/**
 * BSB/server/services/inputs.js
 * ESTRATEGIA: REMANENTE DISTRIBUIDO EXPONENCIAL
 */

const { 
    calculateDistributedSizes, 
    calculateStepGrow 
} = require('../autobotCalculations');

function safeParseFloat(val) {
    if (val === undefined || val === null || val === "") return undefined;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? undefined : parsed;
}

function processUserInputs(amtL, amtS, amtAI, existingConfig = {}) {
    const MAX_CAP = 6140.0;
    const l = Math.min(parseFloat(amtL) || 0, MAX_CAP);
    const s = Math.min(parseFloat(amtS) || 0, MAX_CAP);

    const calculateScalpingGrid = (totalAmount, side) => {
        const sizes = calculateDistributedSizes(totalAmount);
        if (!sizes || sizes.length < 3) return null;

        const n = sizes.length;
        const stepInc = calculateStepGrow(n); 
        const sizeMultiplier = sizes[1] / sizes[0]; 
        
        return {
            amountUsdt: parseFloat(totalAmount.toFixed(2)),
            purchaseUsdt: 6.0,
            price_var: Math.max(0.015, 0.01),
            price_step_inc: parseFloat(stepInc.toFixed(4)),
            size_var: Math.max(parseFloat(sizeMultiplier.toFixed(4)), 1.0),
            profit_percent: Math.max(0.013, 0.01),
            trailing_percent: Math.max(0.003, 0.01),
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
        amountUsdt: safeParseFloat(data.amountUsdt),
        purchaseUsdt: safeParseFloat(data.purchaseUsdt),
        price_var: safeParseFloat(data.price_var),
        size_var: safeParseFloat(data.size_var),
        profit_percent: safeParseFloat(data.profit_percent),
        price_step_inc: safeParseFloat(data.price_step_inc),
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