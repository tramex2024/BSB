/**
 * apiService.js - Comunicaciones REST
 * Sincronizado con analyticsController.js y lógica de estrategias
 */
import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus } from '../main.js';

/**
 * Función base para peticiones privadas
 */
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
        
        const contentType = response.headers.get("content-type");
        let result;
        if (contentType && contentType.includes("application/json")) {
            result = await response.json();
        } else {
            result = { success: response.ok };
        }
        
        if (response.status === 401) {
            logStatus("⚠️ Sesión expirada. Por favor, relogea.", "error");
            return { success: false, message: "Unauthorized" };
        }
        
        // El controlador envía { success: true, data: ... }, aquí extraemos 'data'
        return result.success ? result.data : result;
    } catch (error) {
        console.error(`Error en ${endpoint}:`, error);
        logStatus("❌ Error de red: El servidor no responde", "error");
        return { success: false, message: "Connection error." };
    }
}

// --- SECCIÓN: DASHBOARD & ESTADÍSTICAS ---

/**
 * Obtiene los KPIs filtrando por estrategia (Long/Short)
 */
export async function fetchCycleKpis(strategy = 'Long') {
    return await privateFetch(`/api/v1/analytics/stats?strategy=${strategy}`); 
}

/**
 * Obtiene la curva de capital filtrando por estrategia
 */
export async function fetchEquityCurveData(strategy = 'Long') {
    return await privateFetch(`/api/v1/analytics/equity-curve?strategy=${strategy}`);
}

// --- SECCIÓN: CONFIGURACIÓN Y CONTROL DEL BOT ---

export function getBotConfiguration() {
    const getNum = (id) => {
        const el = document.getElementById(id);
        return el ? parseFloat(el.value) || 0 : 0;
    };
    const getCheck = (id) => document.getElementById(id)?.checked || false;

    return {
        symbol: "BTC_USDT",
        long: {
            amountUsdt: getNum('auamountl-usdt'),
            purchaseUsdt: getNum('aupurchasel-usdt'),
            price_var: getNum('audecrementl'),
            size_var: getNum('auincrementl'),
            trigger: getNum('autriggerl'),
            stopAtCycle: getCheck('au-stop-long-at-cycle'),
            enabled: true
        },
        short: {
            amountUsdt: getNum('auamounts-usdt'),
            purchaseUsdt: getNum('aupurchases-usdt'),
            price_var: getNum('audecrements'),
            size_var: getNum('auincrements'),
            trigger: getNum('autriggers'),
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: true
        }
    };
}

export async function toggleBotSideState(isRunning, side) {
    const action = isRunning ? 'stop' : 'start';
    const endpoint = `/api/autobot/${action}/${side}`;
    const config = getBotConfiguration();

    const btnId = side === 'long' ? 'austartl-btn' : 'austarts-btn';
    const btn = document.getElementById(btnId);
    
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    logStatus(`⏳ Solicitando ${action.toUpperCase()} para ${side.toUpperCase()}...`, "info");

    try {
        const data = await privateFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify({ config }) 
        });

        if (data.success || data === true) { // Maneja ambos tipos de retorno
            const msg = `${side.toUpperCase()} ${isRunning ? 'detenido' : 'iniciado'}`;
            displayMessage(msg, 'success');
            logStatus(`✅ ${msg}`, "success");
        } else {
            displayMessage(`Error: ${data.message || 'Error desconocido'}`, 'error');
            logStatus(`❌ Falló ${action}: ${data.message || 'Error'}`, "error");
        }
        return data;
    } catch (err) {
        logStatus(`❌ Error crítico en ${action}`, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}