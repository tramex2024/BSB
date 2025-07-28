// public/js/modules/balance.js
import { isLoggedIn, fetchFromBackend, displayLogMessage } from './auth.js'; // Importa isLoggedIn y fetchFromBackend
import { actualizarCalculos } from './calculations.js'; // Necesita actualizarCalculos

export async function getBalances() {
    if (!isLoggedIn) {
        if (document.getElementById('balance')) {
            document.getElementById('balance').textContent = 'Login to see';
        }
        return;
    }
    try {
        const response = await fetchFromBackend('/api/user/bitmart/balance');

        if (Array.isArray(response)) {
            const usdt = response.find(w => w.currency === "USDT");
            const balance = usdt ? parseFloat(usdt.available).toFixed(2) : '0.00';
            if (document.getElementById('balance')) {
                document.getElementById('balance').textContent = balance;
                actualizarCalculos();
            }
            displayLogMessage(`USDT Balance: ${balance}`, 'info');
        } else {
            if (document.getElementById('balance')) {
                document.getElementById('balance').textContent = 'Error fetching balances.';
            }
            console.error('getBalances: Unexpected backend response structure:', response);
            displayLogMessage('Error fetching balances: Unexpected data structure.', 'error');
        }
    } catch (error) {
        console.error('Error al cargar balances:', error);
        if (document.getElementById('balance')) {
            document.getElementById('balance').textContent = 'Error';
        }
        displayLogMessage(`Error loading balances: ${error.message}`, 'error');
    }
}