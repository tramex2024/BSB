// public/js/modules/apiService.js

import { displayMessage } from './uiManager.js';
import { TRADE_SYMBOL_BITMART, BACKEND_URL } from '../main.js';

async function privateFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) return { success: false, message: "Sesión no encontrada." };

    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    try {
        const response = await fetch(`${BACKEND_URL}${endpoint}`, { ...defaultOptions, ...options });
        return await response.json();
    } catch (error) {
        console.error(`Error en ${endpoint}:`, error);
        return { success: false, message: "Error de conexión." };
    }
}

export function getBotConfiguration() {
    const getNum = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const getCheck = (id) => document.getElementById(id)?.checked || false;

    return {
        symbol: "BTC_USDT",
        long: {
            amountUsdt: getNum('auamount-usdt'),
            purchaseUsdt: getNum('aupurchase-usdt'),
            // Enviamos 'trigger' porque tu backend lo busca para convertirlo
            trigger: getNum('autrigger'), 
            price_var: getNum('audecrement'),
            size_var: getNum('auincrement'),
            enabled: true
        },
        short: {
            amountBtc: getNum('auamount-btc'),
            sellBtc: getNum('aupurchase-btc'),
            trigger: getNum('autrigger'),
            price_var: getNum('audecrement'),
            size_var: getNum('auincrement'),
            enabled: false
        },
        // Clave para MongoDB: debe coincidir con el campo en la raíz de 'config'
        stopAtCycle: getCheck('au-stop-at-cycle-end') 
    };
}

export async function sendConfigToBackend() {
    const config = getBotConfiguration();
    const data = await privateFetch('/api/autobot/update-config', {
        method: 'POST',
        body: JSON.stringify({ config })
    });
    if (!data.success) console.warn('Error auto-save:', data.message);
}

export async function toggleBotState(isRunning) {
    const endpoint = isRunning ? '/api/autobot/stop' : '/api/autobot/start';
    const config = isRunning ? {} : getBotConfiguration();

    const btn = document.getElementById('austart-btn');
    if (btn) btn.disabled = true;

    const data = await privateFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ config })
    });

    if (data.success) {
        displayMessage(`Bot ${isRunning ? 'detenido' : 'iniciado'}`, 'success');
    } else {
        displayMessage(`Error: ${data.message}`, 'error');
    }

    if (btn) btn.disabled = false;
    return data;
}

export async function fetchEquityCurveData() {
    const data = await privateFetch('/api/v1/analytics/equity-curve');
    return data.success ? data.data : (Array.isArray(data) ? data : []);
}

export async function fetchCycleKpis() {
    const data = await privateFetch('/api/v1/analytics/kpis');
    if (data.success) return data.data;
    return Array.isArray(data) ? (data[0] || data) : { averageProfitPercentage: 0, totalCycles: 0 };
}