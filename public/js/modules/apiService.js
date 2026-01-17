import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus } from '../main.js'; // Importamos logStatus

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
        logStatus("❌ Error de comunicación con el backend", true);
        return { success: false, message: "Connection error." };
    }
}

// --- ANALÍTICAS DASHBOARD ---
export async function fetchCycleKpis() {
    const data = await privateFetch('/api/v1/analytics/stats'); 
    return data.success ? data.data : null;
}

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
            price_var: getNum('audecrementl'), // Agregada 'l'
            size_var: getNum('auincrementl'),   // Agregada 'l'
            trigger: getNum('autriggerl'),     // Agregada 'l'
            stopAtCycle: getCheck('au-stop-long-at-cycle'),
            enabled: true
        },
        short: {
            amountUsdt: getNum('auamounts-usdt'), 
            purchaseUsdt: getNum('aupurchases-usdt'), 
            price_var: getNum('audecrements'), // Agregada 's'
            size_var: getNum('auincrements'),   // Agregada 's'
            trigger: getNum('autriggers'),     // Agregada 's'
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: true
        }
    };
}

export async function sendConfigToBackend() {
    const config = getBotConfiguration();
    logStatus("⏳ Actualizando parámetros..."); // Feedback visual en log bar
    const data = await privateFetch('/api/autobot/update-config', {
        method: 'POST',
        body: JSON.stringify({ config })
    });
    if (data.success) {
        logStatus("✅ Parámetros guardados");
    }
}

/**
 * Enciende/apaga Long o Short con feedback en Log Bar
 */
export async function toggleBotSideState(isRunning, side) {
    const action = isRunning ? 'stop' : 'start';
    const endpoint = `/api/autobot/${action}/${side}`;
    
    // Capturamos configuración si es un inicio
    const config = isRunning ? {} : getBotConfiguration();

    const btnId = side === 'long' ? 'austartl-btn' : 'austarts-btn';
    const btn = document.getElementById(btnId);
    if (btn) btn.disabled = true;

    // Mensaje inmediato en la barra de logs
    logStatus(`⏳ Solicitando ${action.toUpperCase()} para ${side.toUpperCase()}...`);

    try {
        const data = await privateFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify({ config })
        });

        if (data.success) {
            const msg = `${side.toUpperCase()} ${isRunning ? 'detenido' : 'iniciado'}`;
            displayMessage(msg, 'success');
            logStatus(`✅ ${msg}`);
        } else {
            displayMessage(`Error: ${data.message}`, 'error');
            logStatus(`❌ Falló ${action}: ${data.message}`, true);
        }
        
        return data;
    } finally {
        if (btn) btn.disabled = false;
    }
}