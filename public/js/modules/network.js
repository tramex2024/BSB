// public/js/modules/network.js

import { fetchFromBackend } from './api.js';
import { displayLogMessage } from './auth.js';
import { getBalances } from './balance.js';
import { displayOrders } from './orders.js';

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

/**
 * Comprueba la conexión a BitMart y obtiene datos consolidados.
 */
export async function checkBitMartConnectionAndData() {
    displayLogMessage('Checking BitMart connection and fetching data...', 'info');
    const connectionIndicator = document.getElementById('status-dot');
    const connectionText = document.getElementById('status-text');

    if (connectionIndicator) {
        connectionIndicator.classList.remove('bg-green-500', 'bg-red-500');
        connectionIndicator.classList.add('bg-yellow-500');
    }
    if (connectionText) {
        connectionText.textContent = 'Connecting...';
    }

    try {
        // CAMBIO CRUCIAL: Se añade el prefijo /api a la ruta
        const data = await fetchFromBackend('/api/bitmart-data');

        if (data.connected) {
            displayLogMessage('Connected to BitMart. Data fetched successfully.', 'success');
            if (connectionIndicator) {
                connectionIndicator.classList.remove('bg-yellow-500', 'bg-red-500');
                connectionIndicator.classList.add('bg-green-500');
            }
            if (connectionText) {
                connectionText.textContent = 'Connected';
            }

            getBalances(data.balance);
            
            const currentTab = document.querySelector('.autobot-tabs button.active-tab')?.id;
            if (currentTab === 'tab-opened' && data.openOrders) {
                displayOrders(data.openOrders, 'opened');
            }

            if (data.ticker && data.ticker.last) {
                cargarPrecioEnVivo(data.ticker.last);
            }

        } else {
            displayLogMessage(`Failed to connect to BitMart: ${data.message || 'Unknown error'}`, 'error');
            if (connectionIndicator) {
                connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
                connectionIndicator.classList.add('bg-red-500');
            }
            if (connectionText) {
                connectionText.textContent = 'Disconnected';
            }
        }
    } catch (error) {
        console.error('Failed to fetch BitMart data:', error);
        displayLogMessage(`Network error: ${error.message}. Could not reach backend.`, 'error');
        if (connectionIndicator) {
            connectionIndicator.classList.remove('bg-yellow-500', 'bg-green-500');
            connectionIndicator.classList.add('bg-red-500');
        }
        if (connectionText) {
            connectionText.textContent = 'Disconnected';
        }
    }
}