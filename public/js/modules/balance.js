// modules/balance.js
import { displayLogMessage } from './auth.js'; // O el nuevo módulo de logs

// Esta función ahora recibe los balances directamente
export function getBalances(balanceData) {
    const balanceElement = document.getElementById('balance'); // Asegúrate de que este elemento existe
    if (!balanceElement) return;

    // Limpiar contenido anterior
    balanceElement.innerHTML = '';

    if (balanceData && balanceData.length > 0) {
        // Aquí adaptas cómo muestras los balances. Ejemplo:
        const usdtBalance = balanceData.find(b => b.currency === 'USDT');
        if (usdtBalance) {
            balanceElement.innerHTML += `<p>USDT: ${parseFloat(usdtBalance.available).toFixed(2)}</p>`;
        }
        const btcBalance = balanceData.find(b => b.currency === 'BTC');
        if (btcBalance) {
            balanceElement.innerHTML += `<p>BTC: ${parseFloat(btcBalance.available).toFixed(5)}</p>`;
        }
        // Añade más monedas si quieres
    } else {
        balanceElement.textContent = 'No balance data available or API not connected.';
    }
    // displayLogMessage('Balances updated.', 'info'); // Opcional
}