// public/js/modules/balance.js (VERSIÓN COMPLETA Y CORREGIDA)

import { BACKEND_URL } from '../main.js';

// --- FUNCIONES INTERNAS ---

/**
 * Actualiza el elemento con el ID 'aubalance' con el saldo real de USDT y BTC
 * del exchange en el formato "USDT: X | BTC: Y".
 * @param {Array<object>} walletData - Array de objetos de saldo de la API de BitMart.
 */
function updateBotBalances(walletData) {
    if (!walletData) return;

    // Buscamos los balances de USDT y BTC en el array de datos
    const usdtBalance = walletData.find(w => w.currency === 'USDT');
    const btcBalance = walletData.find(w => w.currency === 'BTC');

    // Extraemos el saldo disponible ('available') y lo formateamos
    // USDT: 2 decimales
    const usdtValue = usdtBalance ? parseFloat(usdtBalance.available).toFixed(2) : '0.00';
    // BTC: 5 decimales
    const btcValue = btcBalance ? parseFloat(btcBalance.available).toFixed(5) : '0.00000';
    
    // 💡 CONSTRUIR EL FORMATO REQUERIDO: (USDT: X | BTC: Y)
    const formattedBalance = `USDT: ${usdtValue} | BTC: ${btcValue}`;

    // 💡 ASIGNAR AL ID DEL FRONTEND
    const totalBalanceEl = document.getElementById('aubalance');
        
    if (totalBalanceEl) {
        // Asignamos el valor con el formato solicitado
        totalBalanceEl.textContent = formattedBalance; 
    }
}

// --- FUNCIONES EXPORTADAS ---

/**
 * Obtiene los saldos de trading disponibles de BitMart desde el nuevo endpoint.
 * (Usado para la validación de límites al configurar el bot).
 * 🛑 CORRECCIÓN CLAVE: Espera la estructura { success: true, data: { exchange: { ... } } }
 * @returns {Promise<{availableUSDT: number, availableBTC: number}>} Los saldos o un default si falla.
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
        
        // 💡 DEBUG LOG: Dejar el log aquí es útil para futuros errores
        console.log('[BALANCE DEBUG] Respuesta completa de /api/v1/balances/available:', data); 
        
        // 🛑 CORRECCIÓN: Ahora busca la clave 'data' y luego 'exchange'
        if (data.success && data.data && data.data.exchange) { 
            return {
                availableUSDT: data.data.exchange.availableUSDT,
                availableBTC: data.data.exchange.availableBTC
            };
        } else {
            // Maneja la respuesta exitosa pero con estructura incorrecta
            console.error('[BALANCE] Respuesta API inválida para balances disponibles: Estructura incorrecta o:', data.message);
            return { availableUSDT: 0, availableBTC: 0 };
        }
    } catch (error) {
        console.error('[BALANCE] Error al obtener balances disponibles para validación:', error);
        return { availableUSDT: 0, availableBTC: 0 };
    }
}

/**
 * Obtiene los saldos reales de la cuenta de BitMart.
 * (Usado para la actualización periódica del UI a través de polling).
 */
export async function getBalances() {
    try {
        // endpoint antiguo/general para compatibilidad con el UI display:
        // Asumimos que esta ruta devuelve un objeto con data.balance = Array<Balances>
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
            // Llama a la función corregida para actualizar el display con el formato (USDT: X | BTC: Y)
            updateBotBalances(data.balance); 
        } else {
            console.error('API response does not contain wallet data:', data.message);
        }

    } catch (error) {
        console.error('Error getting balances:', error);
    }
}