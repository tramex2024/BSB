// public/js/modules/apiService.js

/**
 * apiService.js - Comunicaciones REST Sincronizadas (2026)
 * Versión: Recuperación de Estabilidad + Corrección de Cruce de Variables
 */
import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus, currentBotState } from '../main.js';

export let isSavingConfig = false;

const MINIMOS = {
    amount: 6.0,
    purchase: 6.0,
    variation: 0.1,
    profit: 0.1,
    step: 0
};

async function privateFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        logStatus("⚠️ Sesión no encontrada.", "error");
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
        return { success: false, message: error.message };
    }
}

// --- ANALYTICS ---
export async function fetchCycleKpis(strategy = 'all') {
    return await privateFetch(`/api/v1/analytics/stats?strategy=${strategy}`); 
}

export async function fetchEquityCurveData(strategy = 'all') {
    return await privateFetch(`/api/v1/analytics/equity-curve?strategy=${strategy}`);
}

/**
 * RECOLECTA CONFIGURACIÓN
 * Versión Híbrida: Soporta Blindaje Automático (Dashboard) y Control Manual (Tabs)
 */
export function getBotConfiguration() {
    // Obtenedor Opcional: Si el input no existe en la pantalla actual, envía undefined.
    // Esto es lo que le dice al servidor: "No toques la configuración técnica, usa el Shield".
    const getOptionalNum = (id) => {
        const el = document.getElementById(id);
        if (!el) return undefined; 
        let rawValue = el.value.trim();
        if (rawValue === "") return undefined;
        const val = parseFloat(rawValue.replace(/[^0-9.-]+/g,""));
        return isNaN(val) ? undefined : val;
    };

    const getNum = (id, path, minVal = 0) => {
        const el = document.getElementById(id);
        if (!el || el.value.trim() === "") {
            const parts = path.split('.');
            return parts.reduce((obj, key) => obj?.[key], currentBotState.config) ?? minVal;
        }
        return parseFloat(el.value.replace(/[^0-9.-]+/g,"")) || minVal;
    };

    const getCheck = (id, path) => {
        const el = document.getElementById(id);
        if (!el) {
            const parts = path.split('.');
            return parts.reduce((obj, key) => obj?.[key], currentBotState.config) ?? false;
        }
        return el.checked;
    };

    return {
        symbol: "BTC_USDT",
        long: {
            amountUsdt:      getNum('auamountl-usdt', 'long.amountUsdt', 100),
            purchaseUsdt:    getOptionalNum('aupurchasel-usdt'),
            price_var:       getOptionalNum('audecrementl'), 
            size_var:        getOptionalNum('auincrementl'),
            profit_percent:  getOptionalNum('autriggerl'),
            price_step_inc:  getOptionalNum('aupricestep-l'),
            stopAtCycle:     getCheck('au-stop-long-at-cycle', 'long.stopAtCycle'),
            enabled:         currentBotState.lstate !== 'STOPPED'
        },
        short: {
            amountUsdt:      getNum('auamounts-usdt', 'short.amountUsdt', 100),
            purchaseUsdt:    getOptionalNum('aupurchases-usdt'),
            price_var:       getOptionalNum('audecrements'),
            size_var:        getOptionalNum('auincrements'),
            profit_percent:  getOptionalNum('autriggers'),
            price_step_inc:  getOptionalNum('aupricestep-s'),
            stopAtCycle:     getCheck('au-stop-short-at-cycle', 'short.stopAtCycle'),
            enabled:         currentBotState.sstate !== 'STOPPED' 
        },
        ai: {
            amountUsdt:      getNum('auamountai-usdt', 'ai.amountUsdt', 100),
            stopAtCycle:     getCheck('au-stop-ai-at-cycle', 'ai.stopAtCycle'),
            enabled:         currentBotState.config?.ai?.enabled || false
        }
    };
}

export async function sendConfigToBackend() {
    const configData = getBotConfiguration();
    isSavingConfig = true; 
    
    try {
        const data = await privateFetch('/api/autobot/update-config', {
            method: 'POST',
            body: JSON.stringify({ config: configData }) 
        });

        if (data && data.success) {
            console.log("💾 Configuración sincronizada en DB");
        }
        return data;
    } catch (err) {
        return { success: false };
    } finally {
        // Reducimos el tiempo de bloqueo para que la UI sea más responsiva
        setTimeout(() => { isSavingConfig = false; }, 500);
    }
}

export async function toggleBotSideState(isRunning, side, providedConfig = null) {
    const sideKey = side.toLowerCase(); 
    const action = isRunning ? 'stop' : 'start';
    
    let btnId = (sideKey === 'long') ? 'austartl-btn' : 
                (sideKey === 'short') ? 'austarts-btn' : 'btn-start-ai';

    const btn = document.getElementById(btnId);
    if (btn) {
        btn.disabled = true;
        btn.textContent = isRunning ? "STOPPING..." : "STARTING...";
    }

    try {
        const config = providedConfig || getBotConfiguration();
        const data = await privateFetch(`/api/autobot/${action}/${sideKey}`, {
            method: 'POST',
            body: JSON.stringify({ config }) 
        });

        if (data && data.success) {
            displayMessage(`${sideKey.toUpperCase()}: ${data.message}`, 'success');
            return data;
        } else {
            throw new Error(data?.message || 'Error en el motor');
        }
    } catch (err) {
        displayMessage(err.message, 'error');
        return { success: false };
    } finally {
        if (btn) btn.disabled = false;
    }
}

export async function triggerPanicStop() {
    try {
        const data = await privateFetch('/api/autobot/panic-stop', { method: 'POST' });
        if (data.success) displayMessage("🚨 PÁNICO ACTIVADO", 'success');
        return data;
    } catch (err) {
        displayMessage("Error al ejecutar pánico", 'error');
        return { success: false };
    }
}