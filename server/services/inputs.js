/**
 * BSB/server/services/inputs.js
 * ESTRATEGIA: BALA DE PLATA (REMANENTE AL FINAL)
 * COBERTURA: 20% | NIVELES: 8 MÁXIMO | MULTIPLICADOR: 2.0x
 * MAX_CAPITAL_STRATEGY: 2500.00 USDT
 * ACTUALIZADO: Soporte para persistencia de stopAtCycle y buscador de step inteligente por lado
 */

/**
 * Procesa los inputs del Dashboard (Blindaje)
 * Ahora recibe 'existingConfig' para no perder el estado de stopAtCycle
 */
function processUserInputs(amtL, amtS, amtAI, existingConfig = {}) {
    // Aplicamos el techo de 2500 USD por estrategia antes de procesar
    const MAX_CAP = 2500.0;
    const l = Math.min(parseFloat(amtL) || 0, MAX_CAP);
    const s = Math.min(parseFloat(amtS) || 0, MAX_CAP);

    const calculateScalpingGrid = (totalAmount, side) => {
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

        // =================================================================
        // 2. CÁLCULO DEL STEP (EL ACORDEÓN INTELIGENTE EN CASCADA LONG / SHORT)
        // DOCUMENTACIÓN: Este bloque simula el comportamiento exacto del 
        // motor en cascada para encontrar el 'stepInc' que estira la última 
        // orden exactamente hasta el ABRANGE_TARGET (20%) desde la orden anterior.
        // =================================================================
        let stepInc = 0;

        if (n > 1) {
            const baseStepDec = START_PRICE_VAR / 100; // Ejemplo: 1.5% -> 0.015
            
            let low = 0;        // Límite inferior de búsqueda para el incremento (%)
            let high = 500;     // Límite superior seguro de búsqueda para el incremento (%)
            let iterations = 0; // Contador de seguridad para evitar bucles infinitos

            // Búsqueda binaria numérica de alta precisión (Máximo 40 ciclos para precisión milimétrica)
            while (iterations < 40) {
                let mid = (low + high) / 2;
                let simulatedPriceFactor = 1.0; 
                
                // Simulación exacta del comportamiento en cascada del motor de cálculos
                for (let i = 0; i < n - 1; i++) {
                    let currentIncrementFactor = 1 + (mid / 100);
                    let currentStep = baseStepDec * Math.pow(currentIncrementFactor, i);
                    
                    // Aplicamos el operador correspondiente al tipo de estrategia analizada
                    if (side === 'long') {
                        simulatedPriceFactor = simulatedPriceFactor * (1 - currentStep);
                    } else {
                        simulatedPriceFactor = simulatedPriceFactor * (1 + currentStep);
                    }
                }

                // Evaluación de objetivos según el lado de la estrategia
                if (side === 'long') {
                    const targetDropFactor = 1 - (ABRANGE_TARGET / 100); // 20% de caída -> 0.80
                    if (simulatedPriceFactor > targetDropFactor) {
                        low = mid;  // Cayó menos del 20%, necesitamos aumentar el paso
                    } else {
                        high = mid; // Cayó más del 20%, necesitamos reducir el paso
                    }
                } else {
                    const targetRiseFactor = 1 + (ABRANGE_TARGET / 100); // 20% de subida -> 1.20
                    if (simulatedPriceFactor < targetRiseFactor) {
                        low = mid;  // Subió menos del 20%, necesitamos aumentar el paso
                    } else {
                        high = mid; // Subió más del 20%, necesitamos reducir el paso
                    }
                }
                iterations++;
            }
            
            // Asignamos el incremento óptimo encontrado por el buscador algorítmico
            stepInc = low;
        }

        // Recuperamos el estado previo de stopAtCycle para ese lado (long/short)
        // Si no existe, por defecto es false.
        const prevStopAtCycle = existingConfig[side]?.stopAtCycle || false;

        return {
            amountUsdt: parseFloat(totalAmount.toFixed(2)),
            purchaseUsdt: PURCHASE_FIXED, 
            price_var: START_PRICE_VAR,
            price_step_inc: parseFloat(stepInc.toFixed(1)),
            size_var: SIZE_VAR_BOT,
            profit_percent: 1.3,
            trailing_percent: 0.3,
            levels: n,
            stopAtCycle: prevStopAtCycle // <-- Aquí es donde el bot "recuerda"
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