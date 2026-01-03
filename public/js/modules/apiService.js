// public/js/modules/apiService.js

import { displayMessage } from './uiManager.js';
import { TRADE_SYMBOL_BITMART, BACKEND_URL } from '../main.js';

/**
 * Recopila todos los datos de los campos de configuración.
 * Se han añadido protecciones para evitar errores si un ID no existe temporalmente.
 */
export function getBotConfiguration() {
    // Función auxiliar para leer valores numéricos de forma segura
    const getNum = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const getCheck = (id) => document.getElementById(id)?.checked || false;

    const config = {
        symbol: TRADE_SYMBOL_BITMART,
        long: {
            enabled: true,
            amountUsdt: getNum('auamount-usdt'),
            purchaseUsdt: getNum('aupurchase-usdt'),
            price_var: getNum('auincrement'),
            size_var: getNum('audecrement'),
            trigger: getNum('autrigger'),
        },
        short: {
            enabled: true,
            amountBtc: getNum('auamount-btc'),
            sellBtc: getNum('aupurchase-btc'),
            price_var: getNum('auincrement'),
            size_var: getNum('audecrement'),
            trigger: getNum('autrigger'),
        },
        options: {
            stopAtCycleEnd: getCheck('au-stop-at-cycle-end'),
        },
    };
    return config;
}

/**
 * Envía la configuración del bot al backend en tiempo real.
 */
export async function sendConfigToBackend() {
    try {
        const config = getBotConfiguration();
        const token = localStorage.getItem('token');
        
        if (!token) return;

        const response = await fetch(`${BACKEND_URL}/api/autobot/update-config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ config }), // El backend espera { config: {...} }
        });

        if (!response.ok) {
            const result = await response.json();
            console.warn('Config auto-save warning:', result.message);
        }
    } catch (error) {
        console.error('Failed to auto-send config:', error);
    }
}

/**
 * Envía una solicitud para iniciar o detener el bot.
 */
export async function toggleBotState(isRunning, config) {
    const endpoint = isRunning ? '/api/autobot/stop' : '/api/autobot/start';
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${BACKEND_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ config })
        });

        const data = await response.json();
        
        if (data.success) {
            // Mensaje localizado y claro
            displayMessage(`Bot ${isRunning ? 'detenido' : 'iniciado'} correctamente.`, 'success');
        } else {
            displayMessage(`Error: ${data.message}`, 'error');
        }
    } catch (error) {
        console.error('Error de red en toggleBotState:', error);
        displayMessage('Error de conexión con el servidor.', 'error');
    }
}

// =================================================================
// 💡 ANALÍTICAS DEL DASHBOARD (Rutas v1)
// =================================================================

export async function fetchEquityCurveData() {
    const token = localStorage.getItem('token');
    if (!token) return [];

    try {
        const response = await fetch(`${BACKEND_URL}/api/v1/analytics/equity-curve`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error('Equity Curve Error:', error);
        return [];
    }
}

export async function fetchCycleKpis() {
    const token = localStorage.getItem('token');
    if (!token) return { averageProfitPercentage: 0, totalCycles: 0 };

    try {
        const response = await fetch(`${BACKEND_URL}/api/v1/analytics/kpis`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return { averageProfitPercentage: 0, totalCycles: 0 };
        
        const data = await response.json();
        return Array.isArray(data) ? (data[0] || data) : data;
    } catch (error) {
        console.error('KPIs Error:', error);
        return { averageProfitPercentage: 0, totalCycles: 0 };
    }
}