// public/js/modules/price.js

// Usamos la URL del backend que ya existe para obtener el ticker
const BACKEND_PRICE_URL = 'https://bsb-ppex.onrender.com/ticker';
let priceInterval = null;

/**
 * Función para obtener el precio de un par de trading a través de tu backend
 * y actualizar el elemento HTML correspondiente.
 * @param {string} symbol - El par de trading, por ejemplo 'BTC_USDT'.
 * @param {string} elementId - El ID del elemento HTML donde se mostrará el precio.
 */
async function fetchAndDisplayPrice(symbol, elementId) {
    try {
        // Hacemos la llamada al endpoint de tu backend, pasando el símbolo
        const response = await fetch(`${BACKEND_PRICE_URL}/${symbol}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch price from backend: ${response.statusText}`);
        }
        const data = await response.json();
        
        // El endpoint de tu backend devuelve un objeto con la propiedad 'last'
        const price = data.last;
        const priceElement = document.getElementById(elementId);
        
        if (priceElement) {
            priceElement.textContent = parseFloat(price).toFixed(2);
        }

    } catch (error) {
        console.error("Error al obtener el precio:", error);
        // Opcional: mostrar un mensaje de error en la UI
        const priceElement = document.getElementById(elementId);
        if (priceElement) {
            priceElement.textContent = '---';
        }
    }
}

/**
 * Inicia la actualización del precio en un intervalo regular.
 * @param {string} symbol - El par de trading.
 * @param {string} elementId - El ID del elemento HTML.
 * @param {number} intervalMs - El intervalo de actualización en milisegundos.
 * @returns {number} El ID del intervalo creado.
 */
export function startPriceUpdates(symbol, elementId, intervalMs = 5000) {
    // Si ya hay un intervalo activo, lo detenemos primero
    if (priceInterval) {
        clearInterval(priceInterval);
    }

    // Obtenemos el precio inmediatamente al iniciar
    fetchAndDisplayPrice(symbol, elementId);

    // Luego, configuramos el intervalo para actualizar el precio
    priceInterval = setInterval(() => fetchAndDisplayPrice(symbol, elementId), intervalMs);

    return priceInterval;
}

/**
 * Detiene la actualización del precio.
 */
export function stopPriceUpdates() {
    if (priceInterval) {
        clearInterval(priceInterval);
        priceInterval = null;
        console.log("Actualización de precios detenida.");
    }
}