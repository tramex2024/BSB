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

    const usdtValue = usdtBalance ? parseFloat(usdtBalance.available).toFixed(2) : '0.00';
    const btcValue = btcBalance ? parseFloat(btcBalance.available).toFixed(5) : '0.00000';
    
    // Muestra el balance en el panel de cada bot
    const bots = ['te', 'au', 'ai'];
    bots.forEach(prefix => {
        const totalBalanceEl = document.getElementById(`${prefix}balance`);
        
        if (totalBalanceEl) {
            totalBalanceEl.textContent = `USDT: ${usdtValue} | BTC: ${btcValue}`;
        }
        // Los balances LBalance y SBalance no se tocan,
        // ya que dependen de la lógica de la estrategia.
    });
}

export { getBalances };