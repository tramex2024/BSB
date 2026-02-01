// public/js/modules/apiService.js

/**
 * apiService.js - Comunicaciones REST
 * Sincronizado con Motor Exponencial y Garantía de Desbloqueo de UI
 */
import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus, currentBotState } from '../main.js';

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
 * coincidan exactamente con el Schema de Mongoose.
 */
export function getBotConfiguration() {
    // 🛡️ MEJORA: Evita enviar ceros si el usuario está borrando el input
    const getNum = (id, path) => {
        const el = document.getElementById(id);
        if (!el) return 0;
        
        const rawValue = el.value.trim();
        if (rawValue === "") {
            // Si el campo está vacío, usamos el valor que ya teníamos en memoria para no romper la DB con un 0
            const parts = path.split('.');
            return currentBotState.config?.[parts[0]]?.[parts[1]] || 0;
        }

        const val = parseFloat(rawValue.replace(/[^0-9.-]+/g,""));
        return isNaN(val) ? 0 : val;
    };

    const getCheck = (id) => document.getElementById(id)?.checked || false;

    return {
        symbol: "BTC_USDT", 
        long: {
            amountUsdt: getNum('auamountl-usdt', 'long.amountUsdt'),
            purchaseUsdt: getNum('aupurchasel-usdt', 'long.purchaseUsdt'),
            price_var: getNum('audecrementl', 'long.price_var'),
            size_var: getNum('auincrementl', 'long.size_var'),
            profit_percent: getNum('autriggerl', 'long.profit_percent'),   
            price_step_inc: getNum('aupricestep-l', 'long.price_step_inc'), 
            stopAtCycle: getCheck('au-stop-long-at-cycle'),
            enabled: true
        },
        short: {
            amountUsdt: getNum('auamounts-usdt', 'short.amountUsdt'),
            purchaseUsdt: getNum('aupurchases-usdt', 'short.purchaseUsdt'),
            price_var: getNum('audecrements', 'short.price_var'),
            size_var: getNum('auincrements', 'short.size_var'),
            profit_percent: getNum('autriggers', 'short.profit_percent'),   
            price_step_inc: getNum('aupricestep-s', 'short.price_step_inc'), 
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: true
        },
        ai: {
            amountUsdt: getNum('auamountai-usdt', 'ai.amountUsdt'),
            stopAtCycle: getCheck('au-stop-ai-at-cycle'),
            enabled: true
        }
    };
}

/**
 * Envía la configuración al Backend bloqueando actualizaciones de socket
 */
export async function sendConfigToBackend() {
    isSavingConfig = true; 
    
    try {
        const config = getBotConfiguration();
        const data = await privateFetch('/api/autobot/update-config', {
            method: 'POST',
            body: JSON.stringify({ config })
        });

        if (data && data.success) {
            displayMessage("✅ Configuración sincronizada", 'success');
        } else {
            displayMessage(data?.message || "Error al guardar configuración", 'error');
        }
        return data;
    } catch (err) {
        displayMessage("Error crítico de conexión", 'error');
        return { success: false };
    } finally {
        // Mantenemos el bloqueo un poco más para que el socket no gane la carrera
        setTimeout(() => { isSavingConfig = false; }, 300);
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
        btn.classList.add('opacity-50', 'cursor-not-allowed');
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
            throw new Error(data?.message || 'Error en respuesta del motor');
        }
    } catch (err) {
        displayMessage(err.message, 'error');
        return { success: false };
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}