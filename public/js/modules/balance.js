// public/js/modules/balance.js

import { displayLogMessage } from './auth.js';

// Esta función ahora recibe los balances directamente
export function getBalances(balanceData) {
    const balanceElement = document.getElementById('balance');
    const logMessageElement = document.getElementById('log-message');
    if (!balanceElement) return;

    balanceElement.innerHTML = '';

    if (balanceData && balanceData.length > 0) {
        const usdtBalance = balanceData.find(b => b.currency === 'USDT');
        if (usdtBalance) {
            balanceElement.innerHTML += `<p>USDT: ${parseFloat(usdtBalance.available).toFixed(2)}</p>`;
        }
        const btcBalance = balanceData.find(b => b.currency === 'BTC');
        if (btcBalance) {
            balanceElement.innerHTML += `<p>BTC: ${parseFloat(btcBalance.available).toFixed(5)}</p>`;
        }
        displayLogMessage('Balances updated.', 'info', logMessageElement);
    } else {
        balanceElement.textContent = 'No balance data available or API not connected.';
        displayLogMessage('No balance data received.', 'warning', logMessageElement);
    }
}