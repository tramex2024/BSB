// public/js/modules/balance.js

import { BACKEND_URL } from '../main.js';

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
        
        if (data.success && data.wallet) {
            // Actualizar el balance en cada bot con los datos de la billetera
            updateBotBalances(data.wallet);
        } else {
            console.error('API response does not contain wallet data:', data.message);
        }

    } catch (error) {
        console.error('Error getting balances:', error);
    }
}

function updateBotBalances(walletData) {
    if (!walletData) return;

    const usdtBalance = walletData.find(w => w.currency === 'USDT');
    const btcBalance = walletData.find(w => w.currency === 'BTC');

    // Muestra el balance en el panel de cada bot
    const bots = ['te', 'au', 'ai'];
    bots.forEach(prefix => {
        const lBalanceEl = document.getElementById(`${prefix}lbalance`);
        const sBalanceEl = document.getElementById(`${prefix}sbalance`);
        
        if (lBalanceEl) {
            lBalanceEl.textContent = usdtBalance ? parseFloat(usdtBalance.available).toFixed(2) : '0.00';
        }
        if (sBalanceEl) {
            sBalanceEl.textContent = btcBalance ? parseFloat(btcBalance.available).toFixed(5) : '0.00000';
        }
    });
}

export { getBalances };