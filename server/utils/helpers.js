// BSB/server/utils/helpers.js

/**
 * Helper function to safely parse a value as a number.
 */
function parseNumber(value) {
    // 🟢 Agregamos un chequeo explícito para valores nulos/vacíos antes de parseFloat
    if (value === null || value === undefined || value === '') {
        return 0;
    }
    
    // Convertimos a string por si el valor es un objeto o un número que necesita parsing
    const parsed = parseFloat(String(value)); 
    
    return isNaN(parsed) ? 0 : parsed;
}

module.exports = {
    parseNumber,
};