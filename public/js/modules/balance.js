// public/js/modules/balance.js

import { BACKEND_URL } from '../main.js';

let intervals = {}; // Asegúrate de que esta variable esté definida en el ámbito global del módulo

async function getBalances() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/user/balances`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch balances.');
        }
        const data = await response.json();
        
        // Actualizar el balance en cada bot
        updateBotBalances(data);

    } catch (error) {
        console.error('Error getting balances:', error);
    }
}

function updateBotBalances(data) {
    if (!data || !data.wallet) return;

    const usdtBalance = data.wallet.find(w => w.currency === 'USDT');
    const btcBalance = data.wallet.find(w => w.currency === 'BTC');

    // Update for Testbot
    document.getElementById('telbalance').textContent = usdtBalance ? parseFloat(usdtBalance.available).toFixed(2) : '0.00';
    document.getElementById('tesbalance').textContent = btcBalance ? parseFloat(btcBalance.available).toFixed(5) : '0.00000';
    
    // Update for Autobot
    document.getElementById('aulbalance').textContent = usdtBalance ? parseFloat(usdtBalance.available).toFixed(2) : '0.00';
    document.getElementById('ausbalance').textContent = btcBalance ? parseFloat(btcBalance.available).toFixed(5) : '0.00000';

    // Update for Aibot
    document.getElementById('ailbalance').textContent = usdtBalance ? parseFloat(usdtBalance.available).toFixed(2) : '0.00';
    document.getElementById('aisbalance').textContent = btcBalance ? parseFloat(btcBalance.available).toFixed(5) : '0.00000';
}

export { getBalances };