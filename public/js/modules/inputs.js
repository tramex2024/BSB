/**
 * inputs.js - Motor de Cálculo de Estrategia Blindada (40% Cobertura)
 * Procesa Long, Short y AI para que el usuario corriente no tenga que configurar nada técnico.
 */

const MIN_PURCHASE = 6.00;
const MAX_ORDERS = 15;

/**
 * Lógica Maestra de Cálculo
 * @param {number} totalAmount - Presupuesto total asignado por el usuario
 * @param {string} strategyType - 'long', 'short' o 'ai'
 */
function calculateBalancedParams(totalAmount, strategyType) {
    // Aseguramos un mínimo para el cálculo
    const safeTotal = Math.max(totalAmount, 100); 
    
    // Parámetros base para cubrir el 40% de variación
    let config = {
        purchaseUsdt: MIN_PURCHASE,
        price_var: 0.015,       // Distancia inicial 1.5%
        size_var: 0.18,        // Multiplicador 18% (DCA balanceado)
        price_step_inc: 0.08,  // Incremento de distancia 8%
        max_orders: MAX_ORDERS
    };

    // Ajuste específico para IA: 
    // La IA suele entrar en momentos de volatilidad, por lo que le damos 
    // un multiplicador ligeramente más agresivo (20%) para salir más rápido.
    if (strategyType === 'ai') {
        config.size_var = 0.20; 
        config.price_step_inc = 0.07; // Órdenes ligeramente más juntas
    }

    // Escalabilidad de capital:
    // Si el presupuesto es alto (> $600), subimos la compra inicial (purchaseUsdt)
    // para no depender únicamente del multiplicador y mantener el balance.
    if (totalAmount > 600) {
        config.purchaseUsdt = parseFloat(((totalAmount / 350) * MIN_PURCHASE).toFixed(2));
    }

    return config;
}

/**
 * Punto de entrada principal para el Backend
 */
export function processUserInputs(amtL, amtS, amtAI) {
    return {
        long: calculateBalancedParams(parseFloat(amtL) || 0, 'long'),
        short: calculateBalancedParams(parseFloat(amtS) || 0, 'short'),
        ai: calculateBalancedParams(parseFloat(amtAI) || 0, 'ai')
    };
}