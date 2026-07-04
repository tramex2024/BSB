/**
 * BSB/server/services/inputs.js
 * ESTRATEGIA: REMANENTE DISTRIBUIDO EXPONENCIAL
 */

const { 
    calculateDistributedSizes, 
    calculateStepGrow 
} = require('../autobotCalculations');

/**
 * 🛡️ Valida y parsea un número de forma segura.
 * Si el valor es una cadena vacía, null, undefined o no numérico, devuelve undefined 
 * para evitar que Mongoose intente castear un "NaN".
 */
function safeParseFloat(val) {
    if (val === undefined || val === null || val === "") return undefined;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? undefined : parsed;
}

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
            price_step_inc: parseFloat(stepInc.toFixed(4)), 
            size_var: parseFloat(sizeMultiplier.toFixed(4)), 
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