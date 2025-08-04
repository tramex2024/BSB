// public/js/modules/price.js

const BITMART_API_URL = 'https://api-cloud.bitmart.com/spot/v1/ticker';
let priceInterval = null;

/**
 * Función para obtener el precio de un par de trading de la API de BitMart
 * y actualizar el elemento HTML correspondiente.
 * @param {string} symbol - El par de trading, por ejemplo 'BTC_USDT'.
 * @param {string} elementId - El ID del elemento HTML donde se mostrará el precio.
 */
async function fetchAndDisplayPrice(symbol, elementId) {
    try {
        const response = await fetch(`${BITMART_API_URL}?symbol=${symbol}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch price for ${symbol}: ${response.statusText}`);
        }
        const data = await response.json();
        
        const price = data.data.tickers[0].last_price;
        const priceElement = document.getElementById(elementId);
        
        if (priceElement) {
            priceElement.textContent = parseFloat(price).toFixed(2);
        }

    } catch (error) {
        console.error("Error al obtener el precio de BitMart:", error);
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