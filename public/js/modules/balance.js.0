// public/js/modules/balance.js

import { BACKEND_URL } from '../main.js';

export async function getBalances() {
    try {
        // Corregido: Llamada al endpoint correcto que existe en el backend
        const response = await fetch(`${BACKEND_URL}/api/bitmart-data`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch BitMart data.');
        }
        
        const data = await response.json();
        
        // Corregido: La respuesta del backend devuelve los balances en 'data.balance'
        if (data.connected && data.balance) {
            updateBotBalances(data.balance);
            // También se pueden actualizar las órdenes abiertas y el ticker aquí
            // (Tu main.js ya lo hace con el socket, pero esta es una alternativa)
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
    });
}