// public/js/modules/balance.js (VERSIÓN FINAL Y CORREGIDA)

import { BACKEND_URL } from '../main.js';

// --- FUNCIONES INTERNAS ---

/**
 * Actualiza los elementos de balance USDT y BTC por separado
 * @param {Array<object>} walletData - Array de objetos [{currency: 'USDT', available: 10}, ...]
 */
export function updateBotBalances(walletData) {
    if (!walletData || !Array.isArray(walletData)) return;

    // Buscamos los balances en el array
    const usdtData = walletData.find(w => w.currency === 'USDT');
    const btcData = walletData.find(w => w.currency === 'BTC');

    // Referencias a los elementos del HTML
    const usdtEl = document.getElementById('aubalance-usdt');
    const btcEl = document.getElementById('aubalance-btc');

    // Actualizamos USDT (2 decimales)
    if (usdtEl && usdtData) {
        usdtEl.textContent = parseFloat(usdtData.available).toLocaleString(undefined, { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
    }

    // Actualizamos BTC (6 decimales para mayor precisión)
    if (btcEl && btcData) {
        btcEl.textContent = parseFloat(btcData.available).toFixed(6);
    }
}

// --- FUNCIONES EXPORTADAS ---

/**
 * Obtiene los saldos para la validación de límites.
 * 🛑 CORRECCIÓN CLAVE: Extrae los datos desde data.data.exchange
 */
export async function fetchAvailableBalancesForValidation() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${BACKEND_URL}/api/v1/balances/available`, {
            headers: {
                'Authorization': `Bearer ${token}` 
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch available balances.');
        }
        
        const data = await response.json();
        
        console.log('[BALANCE DEBUG] Respuesta completa de /api/v1/balances/available:', data); 
        
        // 🚀 CORRECCIÓN APLICADA: data.data existe, y dentro de data.data está exchange.
        if (data.success && data.data && data.data.exchange) { 
            const exchangeData = data.data.exchange;
            return {
                availableUSDT: exchangeData.availableUSDT,
                availableBTC: exchangeData.availableBTC
            };
        } else {
            console.error('[BALANCE] Respuesta API válida, pero estructura de datos incorrecta.', data.message);
            return { availableUSDT: 0, availableBTC: 0 };
        }
    } catch (error) {
        console.error('[BALANCE] Error al obtener balances disponibles para validación:', error);
        return { availableUSDT: 0, availableBTC: 0 };
    }
}

/**
 * Obtiene los saldos reales de la cuenta de BitMart para el polling y display.
 * 🚀 AHORA UTILIZA LA RUTA /api/v1/balances/available Y ADAPTA LA RESPUESTA.
 */
export async function getBalances() {
    try {
        const token = localStorage.getItem('token');
        // 🛑 Usamos la ruta que sabemos que funciona: /api/v1/balances/available
        const response = await fetch(`${BACKEND_URL}/api/v1/balances/available`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch available balances for polling.');
        }
        
        const data = await response.json();
        
        console.log('[POLLING DEBUG - Ruta Unificada] Respuesta de /api/v1/balances/available:', data); 

        // 🛑 Adaptación de la respuesta:
        if (data.success && data.data && data.data.exchange) {
            const exchangeData = data.data.exchange;
            
            // Convertimos el objeto de resumen (exchangeData) al formato Array 
            // que espera updateBotBalances: [{ currency, available }, ...]
            const formattedBalances = [
                { currency: 'USDT', available: exchangeData.availableUSDT },
                { currency: 'BTC', available: exchangeData.availableBTC }
            ];
            
            // Llamamos a la función de actualización con el array de balances
            updateBotBalances(formattedBalances); 
            
        } else {
            console.error('[POLLING] Respuesta API válida, pero estructura de datos incorrecta.', data.message);
        }

    } catch (error) {
        console.error('Error getting balances (polling):', error);
    }
}