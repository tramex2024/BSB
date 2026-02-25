// server/services/inputs.js
const MIN_PURCHASE = 6.00;
const MAX_ORDERS = 15;

function calculateBalancedParams(totalAmount, strategyType) {
    let config = {
        purchaseUsdt: MIN_PURCHASE,
        price_var: 0.015,       
        size_var: 0.18,        
        price_step_inc: 0.08,  
        max_orders: MAX_ORDERS
    };

    if (strategyType === 'ai') {
        config.size_var = 0.20; 
        config.price_step_inc = 0.07;
    }

    // Escalamiento de compra inicial si el capital es alto
    if (totalAmount > 600) {
        config.purchaseUsdt = parseFloat(((totalAmount / 350) * MIN_PURCHASE).toFixed(2));
    }

    return config;
}

function processUserInputs(amtL, amtS, amtAI) {
    return {
        long: calculateBalancedParams(parseFloat(amtL) || 0, 'long'),
        short: calculateBalancedParams(parseFloat(amtS) || 0, 'short'),
        ai: calculateBalancedParams(parseFloat(amtAI) || 0, 'ai')
    };
}

module.exports = { processUserInputs };