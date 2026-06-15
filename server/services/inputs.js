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
        // 1. Obtener distribución de tamaños (Reglas 1-7)
        const sizes = calculateDistributedSizes(totalAmount);
        if (!sizes) return null;

        const n = sizes.length;
        if (n < 3) return null;

        // 2. Obtener StepGrow exacto para el 18% de cobertura (Target 0.82)
        const stepInc = calculateStepGrow(n);

        // Recuperar estado de persistencia
        const prevStopAtCycle = existingConfig[side]?.stopAtCycle || false;

        return {
            amountUsdt: parseFloat(totalAmount.toFixed(2)),
            purchaseUsdt: 6.0, 
            price_var: 1.5, // START_STEP
            price_step_inc: parseFloat(stepInc.toFixed(1)),
            size_var: 100, // Ajustado según tu lógica de escalado
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
 * Procesa la configuración específica para el bot de Inteligencia Artificial
 */
function processAIInputs(amtAI, existingAIConfig = {}) {
    const amount = parseFloat(amtAI) || 0;
    const minAI = 20.0; 
    const finalAmount = amount < minAI ? minAI : amount;

    return {
        amountUsdt: parseFloat(finalAmount.toFixed(2)),
        stopAtCycle: !!existingAIConfig.stopAtCycle // Mantener estado
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
        price_step_inc: parseFloat(parseFloat(data.price_step_inc || 0).toFixed(2)),
        stopAtCycle: data.stopAtCycle === true || data.stopAtCycle === 'true'
    };
}

module.exports = { 
    processUserInputs,
    processAdvancedInputs, 
    processAIInputs 
};