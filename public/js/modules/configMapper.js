/**
 * configMapper.js - Data Transformation & Validation Layer
 */
import { getSanitizedValue } from './uiManager.js';

const LIMITES = {
    MAX_AMOUNT: 50000, // Límite de seguridad hardcodeado
    MIN_AMOUNT: 6.0,
    MAX_PRICE_VAR: 50.0,
    MIN_PRICE_VAR: 0.01
};

// ... (Mantén las funciones getNum y getCheck igual que antes) ...
const getNum = (id, path, stateConfig, minVal = 0) => {
    const sanitized = getSanitizedValue(id);
    const parts = path.split('.');
    const stateVal = parts.reduce((obj, key) => obj?.[key], stateConfig);
    if (sanitized !== undefined && !isNaN(sanitized)) return sanitized;
    const parsedState = parseFloat(stateVal);
    return (!isNaN(parsedState) && isFinite(parsedState)) ? parsedState : minVal;
};

const getCheck = (id, path, stateConfig) => {
    const el = document.getElementById(id);
    if (!el) {
        const parts = path.split('.');
        return parts.reduce((obj, key) => obj?.[key], stateConfig) ?? false;
    }
    return el.checked;
};

/**
 * 🛡️ VALIDADOR DE SEGURIDAD
 * Retorna true si la configuración es válida, lanza error si no.
 */
export function validateConfig(config) {
    const strategies = ['long', 'short', 'ai'];
    
    for (const s of strategies) {
        if (!config[s]) continue;
        
        if (config[s].amountUsdt > LIMITES.MAX_AMOUNT) {
            throw new Error(`⚠️ Seguridad: El monto para ${s.toUpperCase()} excede el límite permitido ($${LIMITES.MAX_AMOUNT})`);
        }
        if (config[s].amountUsdt < LIMITES.MIN_AMOUNT && config[s].enabled) {
            throw new Error(`⚠️ Seguridad: El monto para ${s.toUpperCase()} es muy bajo (Mínimo $${LIMITES.MIN_AMOUNT})`);
        }
        if (config[s].price_var && (config[s].price_var < LIMITES.MIN_PRICE_VAR || config[s].price_var > LIMITES.MAX_PRICE_VAR)) {
             throw new Error(`⚠️ Seguridad: La variación de precio para ${s.toUpperCase()} está fuera de rango.`);
        }
    }
    return true;
}

export function mapConfigFromDOM(currentBotState) {
    const cfg = currentBotState.config || {};
    
    const config = {
        symbol: "BTC_USDT",
        long: {
            amountUsdt: getNum('auamountl-usdt', 'long.amountUsdt', cfg, 6.0),
            purchaseUsdt: getNum('aupurchasel-usdt', 'long.purchaseUsdt', cfg, 6.0),
            price_var: getNum('audecrementl', 'long.price_var', cfg, 0.1),
            profit_percent: getNum('autriggerl', 'long.profit_percent', cfg, 0.1),
            size_var: getNum('auincrementl', 'long.size_var', cfg, 1),
            stopAtCycle: getCheck('au-stop-long-at-cycle', 'long.stopAtCycle', cfg),
            enabled: currentBotState.lstate !== 'STOPPED'
        },
        short: {
            amountUsdt: getNum('auamounts-usdt', 'short.amountUsdt', cfg, 6.0),
            purchaseUsdt: getNum('aupurchases-usdt', 'short.purchaseUsdt', cfg, 6.0),
            price_var: getNum('audecrements', 'short.price_var', cfg, 0.1),
            profit_percent: getNum('autriggers', 'short.profit_percent', cfg, 0.1),
            size_var: getNum('auincrements', 'short.size_var', cfg, 1),
            stopAtCycle: getCheck('au-stop-short-at-cycle', 'short.stopAtCycle', cfg),
            enabled: currentBotState.sstate !== 'STOPPED'
        },
        ai: {
            amountUsdt: getNum('auamountai-usdt', 'ai.amountUsdt', cfg, 100) || getNum('ai-amount-usdt', 'ai.amountUsdt', cfg, 100),
            stopAtCycle: getCheck('au-stop-ai-at-cycle', 'ai.stopAtCycle', cfg) || getCheck('ai-stop-ai-at-cycle', 'ai.stopAtCycle', cfg),
            enabled: cfg?.ai?.enabled || false
        }
    };

    // Validamos antes de retornar
    validateConfig(config);
    
    return config;
}