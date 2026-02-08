/**
 * BSB/server/utils/helpers.js
 * UTILERÍAS GENERALES DE PROCESAMIENTO
 */

/**
 * Safely parses a value as a number.
 * @param {any} value - The value to parse.
 * @param {number} fallback - Value to return if parsing fails (default: 0).
 */
function parseNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === '') {
        return fallback;
    }
    
    const parsed = parseFloat(String(value)); 
    
    return isNaN(parsed) ? fallback : parsed;
}

/**
 * Rounds a number to a specific precision (important for crypto pairs).
 * Example: roundTo(12.34567, 2) => 12.35
 */
function roundTo(value, decimals = 2) {
    const num = parseNumber(value);
    return Number(Math.round(num + 'e' + decimals) + 'e-' + decimals);
}

/**
 * Calculates the percentage change between two values.
 */
function getPercentageChange(current, previous) {
    const curr = parseNumber(current);
    const prev = parseNumber(previous);
    if (prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
}

module.exports = {
    parseNumber,
    roundTo,
    getPercentageChange
};