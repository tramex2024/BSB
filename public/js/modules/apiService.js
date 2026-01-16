// public/js/modules/apiService.js
import { displayMessage } from './uiManager.js';
import { BACKEND_URL } from '../main.js';

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

// --- NUEVAS FUNCIONES PARA DASHBOARD (Analíticas) ---

/**
 * Obtiene los KPIs de los ciclos (Promedio de profit, ciclos totales, etc.)
 */
export async function fetchCycleKpis() {
    // Apunta a la ruta de analytics definida en tu server.js
    const data = await privateFetch('/api/v1/analytics/stats'); 
    return data.success ? data.data : null;
}

/**
 * Obtiene los datos para el gráfico de la curva de capital
 */
export async function fetchEquityCurveData() {
    const data = await privateFetch('/api/v1/analytics/equity-curve');
    return data.success ? data.data : [];
}

// --- LÓGICA DE CONFIGURACIÓN ---

export function getBotConfiguration() {
    const getNum = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const getCheck = (id) => document.getElementById(id)?.checked || false;

    return {
        symbol: "BTC_USDT",
        long: {
            amountUsdt: getNum('auamountl-usdt'),
            purchaseUsdt: getNum('aupurchasel-usdt'),
            price_var: getNum('audecrement'),
            size_var: getNum('auincrement'),
            trigger: getNum('autrigger'),
            stopAtCycle: getCheck('au-stop-long-at-cycle'),
            enabled: true
        },
        short: {
            amountUsdt: getNum('auamounts-usdt'), 
            purchaseUsdt: getNum('aupurchases-usdt'), 
            price_var: getNum('audecrement'),
            size_var: getNum('auincrement'),
            trigger: getNum('autrigger'),
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: true
        }
    };
}

export async function sendConfigToBackend() {
    const config = getBotConfiguration();
    await privateFetch('/api/autobot/update-config', {
        method: 'POST',
        body: JSON.stringify({ config })
    });
}

/**
 * Nueva función para encender/apagar Long o Short de forma independiente
 */
export async function toggleBotSideState(isRunning, side) {
    // side será 'long' o 'short'
    const endpoint = isRunning ? `/api/autobot/stop/${side}` : `/api/autobot/start/${side}`;
    const config = isRunning ? {} : getBotConfiguration();

    // Deshabilitamos el botón que se pulsó para evitar clics dobles
    const btnId = side === 'long' ? 'austartl-btn' : 'austarts-btn';
    const btn = document.getElementById(btnId);
    if (btn) btn.disabled = true;

    const data = await privateFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ config })
    });

    if (data.success) {
        displayMessage(`${side.toUpperCase()} ${isRunning ? 'detenido' : 'iniciado'} correctamente`, 'success');
    } else {
        displayMessage(`Error: ${data.message}`, 'error');
    }

    if (btn) btn.disabled = false;
    return data;
}