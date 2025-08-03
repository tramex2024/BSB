// public/js/modules/network.js

// Este módulo ya no necesita hacer llamadas a la API directamente.
// La lógica principal para obtener datos de BitMart ahora está en navigation.js.
// Aquí solo proporcionamos la función para actualizar el precio en el DOM.

// Importamos la función displayLogMessage para mostrar mensajes en la UI.
import { displayLogMessage } from './auth.js';

/**
 * Actualiza el precio en vivo en el elemento del DOM.
 * Esta función ya no llama a la API. Recibe el precio como argumento.
 * @param {string | number} price - El precio actual a mostrar.
 */
export function cargarPrecioEnVivo(price) {
    const priceElement = document.getElementById('price');
    if (!priceElement) {
        // Si el elemento del precio no está en el DOM, no hacemos nada.
        return;
    }
    
    if (price !== null && !isNaN(price)) {
        priceElement.textContent = parseFloat(price).toFixed(2);
    } else {
        // Si el precio no es válido, mostramos un mensaje de error.
        priceElement.textContent = 'N/A';
        displayLogMessage('Error: Invalid price data received.', 'error');
    }
}