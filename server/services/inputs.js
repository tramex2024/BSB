/**
 * BSB/server/services/inputs.js
 * ESTRATEGIA: BALA DE PLATA (REMANENTE AL FINAL)
 * COBERTURA: 20% | NIVELES: 8 MÁXIMO | MULTIPLICADOR: 2.0x
 * MAX_CAPITAL_STRATEGY: 2500.00 USDT
 * Sincronizado con: autobotCalculations.js
 */

function processUserInputs(amtL, amtS, amtAI) {
    // Aplicamos el techo de 2500 USD por estrategia antes de procesar
    const MAX_CAP = 2500.0;
    const l = Math.min(parseFloat(amtL) || 0, MAX_CAP);
    const s = Math.min(parseFloat(amtS) || 0, MAX_CAP);

    const calculateScalpingGrid = (totalAmount) => {
        // --- PARÁMETROS DE ORO ---
        const ABRANGE_TARGET = 20;     
        const SIZE_VAR_BOT = 100;      
        const START_PRICE_VAR = 1.5;   
        const PURCHASE_FIXED = 6.0;    
        const MAX_LEVELS = 8;          
        const MATH_MULTIPLIER = 2.0;   
        
        if (totalAmount < 186) return null; 

        // 1. DETERMINAR NÚMERO DE NIVELES (N)
        let n = 0;
        let cumulativeBase = 0;
        let orderBase = PURCHASE_FIXED;
        
        while (cumulativeBase + orderBase <= totalAmount && n < MAX_LEVELS) {
            cumulativeBase += orderBase;
            n++;
            orderBase *= MATH_MULTIPLIER;
        }

        if (n < 3) return null; 

        // 2. CÁLCULO DEL STEP (EL ACORDEÓN)
        let stepInc = 0;
        if (n > 1) {
            let targetRatio = ABRANGE_TARGET / (START_PRICE_VAR * n);
            stepInc = (Math.pow(targetRatio, 1 / (n * 0.75)) - 1) * 100;
        }

        return {
            amountUsdt: parseFloat(totalAmount.toFixed(2)),
            purchaseUsdt: PURCHASE_FIXED, 
            price_var: START_PRICE_VAR,
            price_step_inc: parseFloat(stepInc.toFixed(1)),
            size_var: SIZE_VAR_BOT,
            profit_percent: 1.3,
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

/**
 * Procesa la configuración específica para el bot de Inteligencia Artificial
 */
function processAIInputs(amtAI) {
    const amount = parseFloat(amtAI) || 0;
    const minAI = 20.0; 
    const finalAmount = amount < minAI ? minAI : amount;

    return {
        amountUsdt: parseFloat(finalAmount.toFixed(2))
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
        stopAtCycle: !!data.stopAtCycle
    };
}

module.exports = { 
    processUserInputs,
    processAdvancedInputs, 
    processAIInputs 
};