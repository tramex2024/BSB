/**
 * apiService.js - Comunicaciones REST
 * Sincronizado con Motor Exponencial y Garantía de Desbloqueo de UI
 */
import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus } from '../main.js';

// 🛡️ ESCUDO: Evita que el Socket sobrescriba la UI con datos viejos mientras guardamos
export let isSavingConfig = false;

/**
 * Función base para peticiones privadas con Timeout y AbortController
 */
async function privateFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        logStatus("⚠️ Sesión no encontrada. Por favor inicie sesión.", "error");
        return { success: false, message: "Sesión no encontrada." };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); 

    const defaultOptions = {
        signal: controller.signal,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    try {
        const response = await fetch(`${BACKEND_URL}${endpoint}`, { ...defaultOptions, ...options });
        clearTimeout(timeoutId);
        
        if (response.status === 401) {
            logStatus("⚠️ Sesión expirada.", "error");
            localStorage.removeItem('token');
            return { success: false, message: "Unauthorized" };
        }

        const result = await response.json().catch(() => ({ 
            success: response.ok, 
            message: response.statusText 
        }));

        return result; 

    } catch (error) {
        if (error.name === 'AbortError') {
            logStatus("❌ Tiempo de espera agotado", "error");
        } else {
            logStatus("❌ Error de red o conexión", "error");
        }
        return { success: false, message: error.message };
    }
}

// --- SECCIÓN: ANALYTICS ---

export async function fetchCycleKpis(strategy = 'Long') {
    return await privateFetch(`/api/v1/analytics/stats?strategy=${strategy}`); 
}

export async function fetchEquityCurveData(strategy = 'Long') {
    return await privateFetch(`/api/v1/analytics/equity-curve?strategy=${strategy}`);
}

// --- SECCIÓN: CONFIGURACIÓN Y CONTROL DEL BOT ---

/**
 * Recolecta la configuración de la UI asegurando que las llaves
 * coincidan exactamente con el Schema de Mongoose en el Backend.
 */
export function getBotConfiguration() {
    const getNum = (id) => {
        const el = document.getElementById(id);
        // Eliminamos cualquier caracter no numérico excepto el punto y el signo menos
        return el ? parseFloat(el.value.replace(/[^0-9.-]+/g,"")) || 0 : 0;
    };
    const getCheck = (id) => document.getElementById(id)?.checked || false;

    return {
        symbol: "BTC_USDT", 
        long: {
            amountUsdt: getNum('auamountl-usdt'),
            purchaseUsdt: getNum('aupurchasel-usdt'),
            price_var: getNum('audecrementl'),
            size_var: getNum('auincrementl'),
            profit_percent: getNum('autriggerl'),   // Sincronizado: Frontend -> Backend
            price_step_inc: getNum('aupricestep-l'), // Sincronizado: Frontend -> Backend
            stopAtCycle: getCheck('au-stop-long-at-cycle'),
            enabled: true
        },
        short: {
            amountUsdt: getNum('auamounts-usdt'),
            purchaseUsdt: getNum('aupurchases-usdt'),
            price_var: getNum('audecrements'),
            size_var: getNum('auincrements'),
            profit_percent: getNum('autriggers'),   // Sincronizado: Frontend -> Backend
            price_step_inc: getNum('aupricestep-s'), // Sincronizado: Frontend -> Backend
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: true
        },
        ai: {
            amountUsdt: getNum('auamountai-usdt'),
            stopAtCycle: getCheck('au-stop-ai-at-cycle'),
            enabled: true
        }
    };
}

/**
 * Envía la configuración al Backend bloqueando actualizaciones de socket
 */
export async function sendConfigToBackend() {
    isSavingConfig = true; // 🛡️ Bloqueamos actualizaciones de UI entrantes
    
    try {
        const config = getBotConfiguration();
        const data = await privateFetch('/api/autobot/update-config', {
            method: 'POST',
            body: JSON.stringify({ config })
        });

        if (data && data.success) {
            displayMessage("✅ Configuración guardada correctamente", 'success');
        } else {
            displayMessage(data?.message || "Error al guardar", 'error');
        }
        return data;
    } catch (err) {
        displayMessage("Error de conexión al guardar", 'error');
        return { success: false };
    } finally {
        // Retraso de 800ms para permitir que el socket reciba el nuevo estado antes de desbloquear la UI
        setTimeout(() => { isSavingConfig = false; }, 800);
    }
}

/**
 * Activa o desactiva una estrategia (Long, Short o AI)
 */
export async function toggleBotSideState(isRunning, side, providedConfig = null) {
    const sideKey = side.toLowerCase(); 
    const action = isRunning ? 'stop' : 'start';
    const btnId = sideKey === 'long' ? 'austartl-btn' : (sideKey === 'short' ? 'austarts-btn' : 'austartai-btn');
    const btn = document.getElementById(btnId);

    if (btn) {
        btn.disabled = true;
        btn.classList.remove('bg-emerald-600', 'bg-red-600');
        btn.classList.add('bg-slate-600'); 
        btn.textContent = isRunning ? "STOPPING..." : "STARTING...";
    }

    try {
        const config = providedConfig || getBotConfiguration();
        const endpoint = `/api/autobot/${action}/${sideKey}`; 
        
        const data = await privateFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify({ config }) 
        });

        if (data && data.success) {
            displayMessage(`${sideKey.toUpperCase()}: ${data.message}`, 'success');
            return data;
        } else {
            throw new Error(data?.message || 'Error en servidor');
        }
    } catch (err) {
        displayMessage(err.message, 'error');
        
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('bg-slate-600');
            btn.classList.add(isRunning ? 'bg-red-600' : 'bg-emerald-600');
            btn.textContent = isRunning ? `STOP ${sideKey.toUpperCase()}` : `START ${sideKey.toUpperCase()}`;
        }
        return { success: false };
    }
}