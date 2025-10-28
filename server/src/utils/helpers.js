// BSB/server/utils/helpers.js
/**
 * Helper function to safely parse a value as a number.
 */
function parseNumber(value) {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
}

module.exports = {
    parseNumber,
};