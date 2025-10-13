// public/js/modules/balance.js (ACTUALIZADO)

import { BACKEND_URL } from '../main.js';

// --- FUNCIONES INTERNAS (Mantienen la lógica de actualización del display) ---

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

// --- FUNCIONES EXPORTADAS ---

/**
 * Obtiene los saldos de trading disponibles de BitMart desde el nuevo endpoint.
 * @returns {Promise<{availableUSDT: number, availableBTC: number}>} Los saldos o un default si falla.
 */
export async function fetchAvailableBalancesForValidation() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BACKEND_URL}/api/v1/balances/available`, {
            headers: {
                'Authorization': `Bearer ${token}` // Usamos el token para la nueva ruta
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch available balances.');
        }
        
        const data = await response.json();
        
        if (data.success && data.balances) {
            return {
                availableUSDT: data.balances.availableUSDT,
                availableBTC: data.balances.availableBTC
            };
        } else {
            console.error('[BALANCE] Respuesta API inválida para balances disponibles:', data.message);
            return { availableUSDT: 0, availableBTC: 0 };
        }
    } catch (error) {
        console.error('[BALANCE] Error al obtener balances disponibles para validación:', error);
        return { availableUSDT: 0, availableBTC: 0 };
    }
}

/**
 * Mantiene la función original para la actualización periódica del UI.
 * Asumo que /api/bitmart-data sigue devolviendo el array completo de balances.
 */
export async function getBalances() {
    try {
        // endpoint antiguo para compatibilidad con el UI display:
        const token = localStorage.getItem('token');
        const response = await fetch(`${BACKEND_URL}/api/bitmart-data`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch BitMart data.');
        }
        
        const data = await response.json();
        
        if (data.connected && data.balance) {
            updateBotBalances(data.balance);
        } else {
            console.error('API response does not contain wallet data:', data.message);
        }

    } catch (error) {
        console.error('Error getting balances:', error);
    }
}