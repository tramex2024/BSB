// public/js/modules/apiService.js

import { displayMessage } from './uiManager.js';
import { TRADE_SYMBOL_BITMART, BACKEND_URL } from '../main.js';

/**
 * Helper para peticiones fetch privadas con token de autorización
 */
async function privateFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) return { success: false, message: "Session not found." };

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
        console.error(`Error at ${endpoint}:`, error);
        return { success: false, message: "Connection error." };
    }
}

/**
 * Captura la configuración del formulario mapeando los controles independientes.
 * Se asegura de enviar números con punto decimal (.) para compatibilidad con MongoDB.
 */
export function getBotConfiguration() {
    const getNum = (id) => {
        const val = document.getElementById(id)?.value;
        return val ? parseFloat(val) : 0;
    };
    const getCheck = (id) => document.getElementById(id)?.checked || false;

    return {
        symbol: "BTC_USDT",
        long: {
            amountUsdt: getNum('auamount-usdt'),
            purchaseUsdt: getNum('aupurchase-usdt'),
            trigger: getNum('autrigger'), 
            price_var: getNum('audecrement'),
            size_var: getNum('auincrement'),
            // Mapeo independiente para la parada de ciclo Long
            stopAtCycle: getCheck('au-stop-long-at-cycle'),
            enabled: true
        },
        short: {
            amountBtc: getNum('auamount-btc'),
            sellBtc: getNum('aupurchase-btc'),
            trigger: getNum('autrigger'),
            price_var: getNum('audecrement'),
            size_var: getNum('auincrement'),
            // Mapeo independiente para la parada de ciclo Short
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: true
        }
    };
}

/**
 * Envía la configuración actual al backend para auto-guardado
 */
export async function sendConfigToBackend() {
    const config = getBotConfiguration();
    const data = await privateFetch('/api/autobot/update-config', {
        method: 'POST',
        body: JSON.stringify({ config })
    });
    if (!data.success) console.warn('Auto-save error:', data.message);
}

/**
 * Maneja el inicio y parada global del bot
 */
export async function toggleBotState(isRunning) {
    // Si isRunning es true, el usuario pulsó STOP
    const endpoint = isRunning ? '/api/autobot/stop' : '/api/autobot/start';
    const config = isRunning ? {} : getBotConfiguration();

    const btn = document.getElementById('austart-btn');
    if (btn) btn.disabled = true;

    const data = await privateFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ config })
    });

    if (data.success) {
        displayMessage(`Bot ${isRunning ? 'stopped' : 'started'} successfully`, 'success');
    } else {
        displayMessage(`Error: ${data.message}`, 'error');
    }

    if (btn) btn.disabled = false;
    return data;
}

/**
 * Detiene una estrategia (pierna) de forma independiente
 */
export async function stopStrategyIndependently(type) { // type: 'long' o 'short'
    const endpoint = `/api/autobot/stop/${type}`;
    const data = await privateFetch(endpoint, { method: 'POST' });
    
    if (data.success) {
        displayMessage(`${type.toUpperCase()} stopped individually`, 'success');
    } else {
        displayMessage(`Error stopping ${type}: ${data.message}`, 'error');
    }
    return data;
}

/**
 * Obtiene los datos para la curva de equidad (Analytics)
 */
export async function fetchEquityCurveData() {
    const data = await privateFetch('/api/v1/analytics/equity-curve');
    return data.success ? data.data : (Array.isArray(data) ? data : []);
}

/**
 * Obtiene los KPIs de los ciclos cerrados
 */
export async function fetchCycleKpis() {
    const data = await privateFetch('/api/v1/analytics/kpis');
    if (data.success) return data.data;
    return Array.isArray(data) ? (data[0] || data) : { averageProfitPercentage: 0, totalCycles: 0 };
}