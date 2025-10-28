// BSB/server/utils/helpers.js
/**
 * Helper function to safely parse a value as a number.
 * Mueve esta función a un archivo independiente para resolver la dependencia circular.
 */
function parseNumber(value) {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
}

module.exports = {
    parseNumber,
};