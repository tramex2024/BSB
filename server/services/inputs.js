/**
 * BSB/server/services/inputs.js
 * ESTRATEGIA: REMANENTE DISTRIBUIDO
 * ACTUALIZADO: Integración con motor central de cálculos (autobotCalculations.js)
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
        const stepInc = calculateStepGrow(n);
        const sizeVarCalculated = ((sizes[1] / sizes[0]) - 1) * 100;
        const prevStopAtCycle = existingConfig[side]?.stopAtCycle || false;

        return {
            amountUsdt: parseFloat(totalAmount.toFixed(2)),
            purchaseUsdt: 6.0, 
            price_var: 1.5,
            price_step_inc: parseFloat(stepInc.toFixed(4)), 
            size_var: parseFloat(sizeVarCalculated.toFixed(2)), 
            profit_percent: 1.3,
            trailing_percent: 0.3,
            levels: n,
            stopAtCycle: prevStopAtCycle
        };
    };

    // --- ESTA ES LA PARTE QUE TE FALTABA ---
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

/**
 * Procesa y limpia los inputs manuales del modo Advanced (Autobot)
 */
function processAdvancedInputs(data) {
    if (!data) {
        console.error("❌ processAdvancedInputs: No se recibieron datos");
        return null;
    }
    return {
        amountUsdt: parseFloat(parseFloat(data.amountUsdt || 0).toFixed(2)),
        purchaseUsdt: parseFloat(parseFloat(data.purchaseUsdt || 6.0).toFixed(2)),
        price_var: parseFloat(parseFloat(data.price_var || 0.1).toFixed(2)),
        size_var: parseFloat(parseFloat(data.size_var || 1.0).toFixed(2)),
        profit_percent: parseFloat(parseFloat(data.profit_percent || 0.1).toFixed(2)),
        price_step_inc: parseFloat(parseFloat(data.price_step_inc || 0).toFixed(4)), // Corregido a 4
        stopAtCycle: data.stopAtCycle === true || data.stopAtCycle === 'true'
    };
}

module.exports = { 
    processUserInputs,
    processAdvancedInputs, 
    processAIInputs 
};