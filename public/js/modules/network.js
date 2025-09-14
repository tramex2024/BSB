// public/js/modules/network.js

import { fetchFromBackend } from './api.js';
import { displayLogMessage } from './auth.js';
import { getBalances } from './balance.js';
// La función displayOrders fue eliminada de orders.js y su lógica se movió a fetchOrders.

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
            
            // REMOVED: This logic is now handled directly by the tab click handlers in main.js
            // if (currentTab === 'tab-opened' && data.openOrders) {
            //     displayOrders(data.openOrders, 'opened');
            // }

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
