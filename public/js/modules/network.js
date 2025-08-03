// public/js/modules/network.js (CORREGIDO)
import { displayLogMessage } from './auth.js';

/**
 * Actualiza el precio en vivo en el elemento del DOM.
 * @param {string | number} price - El precio actual a mostrar.
 */
export function cargarPrecioEnVivo(price) {
    const priceElement = document.getElementById('price');
    if (!priceElement) {
        return;
    }
    
    if (price !== null && !isNaN(price)) {
        priceElement.textContent = parseFloat(price).toFixed(2);
    } else {
        priceElement.textContent = 'N/A';
        displayLogMessage('Error: Invalid price data received or failed to fetch.', 'error');
    }
}