// public/js/modules/network.js

import { fetchFromBackend } from './api.js';
import { displayLogMessage } from './auth.js';
import { getBalances } from './balance.js';

/**
 * Comprueba la conexión a BitMart y obtiene datos consolidados (usando el endpoint de balances).
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
        // 🛑 CORRECCIÓN: Cambiamos el endpoint a la ruta de balances que sí existe
        const result = await fetchFromBackend('/api/v1/balances/available'); 

        // 💡 Asumimos que si la llamada fue exitosa (HTTP 200), el backend pudo 
        // conectarse a BitMart, o que el backend incluye el estado de conexión
        // dentro del objeto 'result'. Modificamos la comprobación para ser más robustos.
        
        const isConnected = result.success && result.data && result.data.usdt && result.data.btc; // Comprobación más profunda
        
        if (isConnected) {
            displayLogMessage('Connected to BitMart. Balances fetched successfully.', 'success');
            if (connectionIndicator) {
                connectionIndicator.classList.remove('bg-yellow-500', 'bg-red-500');
                connectionIndicator.classList.add('bg-green-500');
            }
            if (connectionText) {
                connectionText.textContent = 'Connected';
            }

            // Llamar a getBalances con los datos del backend
            getBalances(result.data); // result.data es el objeto de balances
            
        } else {
            // Esto podría ocurrir si el backend devuelve success=true pero los datos son incompletos
            // O si el backend falla en el intento de conexión con BitMart internamente.
            const message = result.message || 'Error en los datos de BitMart devueltos.';
            displayLogMessage(`Failed to connect to BitMart: ${message}`, 'error');
            
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