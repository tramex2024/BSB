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

export async function fetchCycleKpis(strategy = 'all') {
    return await privateFetch(`/api/v1/analytics/stats?strategy=${strategy}`); 
}

export async function fetchEquityCurveData(strategy = 'all') {
    return await privateFetch(`/api/v1/analytics/equity-curve?strategy=${strategy}`);
}

// --- SECCIÓN: CONFIGURACIÓN Y CONTROL DEL BOT ---

/**
 * Recolecta la configuración de la UI asegurando correspondencia de IDs
 */
export function getBotConfiguration() {
    const getNum = (id, path) => {
        const el = document.getElementById(id);
        if (!el) return 0;
        
        const rawValue = el.value.trim();
        // Si el usuario deja el input vacío, rescatamos el valor del estado para no enviar 0
        if (rawValue === "") {
            const parts = path.split('.');
            if (parts.length === 2) {
                return currentBotState.config?.[parts[0]]?.[parts[1]] || 0;
            }
            return 0;
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
            price_var: getNum('auincrementl', 'long.price_var'),    // ID verificado
            size_var: getNum('audecrementl', 'long.size_var'),     // ID verificado
            profit_percent: getNum('autriggerl', 'long.profit_percent'),   
            price_step_inc: getNum('aupricestep-l', 'long.price_step_inc'), 
            stopAtCycle: getCheck('au-stop-long-at-cycle'),
            enabled: currentBotState.lstate !== 'STOPPED'
        },
        short: {
            amountUsdt: getNum('auamounts-usdt', 'short.amountUsdt'),
            purchaseUsdt: getNum('aupurchases-usdt', 'short.purchaseUsdt'),
            price_var: getNum('auincrements', 'short.price_var'),   // Corregido: antes podía buscar IDs de Long
            size_var: getNum('audecrements', 'short.size_var'),    // Corregido: antes podía buscar IDs de Long
            profit_percent: getNum('autriggers', 'short.profit_percent'),   
            price_step_inc: getNum('aupricestep-s', 'short.price_step_inc'), 
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: currentBotState.sstate !== 'STOPPED' 
        },
        ai: {
            amountUsdt: getNum('auamountai-usdt', 'ai.amountUsdt') || getNum('ai-amount-usdt', 'ai.amountUsdt'),
            stopAtCycle: getCheck('au-stop-ai-at-cycle') || getCheck('ai-stop-at-cycle'),
            enabled: currentBotState.config?.ai?.enabled || false
        }
    };
}

/**
 * Envía la configuración al Backend bloqueando actualizaciones de socket
 */
export async function sendConfigToBackend() {
    const config = getBotConfiguration();
    
    // Validación mínima para no romper el exchange
    if (config.long.amountUsdt > 0 && config.long.amountUsdt < 5) {
        displayMessage("⚠️ El monto mínimo es $5", 'error');
        return { success: false };
    }

    isSavingConfig = true; // ACTIVAMOS EL ESCUDO
    
    try {
        const data = await privateFetch('/api/autobot/update-config', {
            method: 'POST',
            body: JSON.stringify({ config })
        });

        if (data && data.success) {
            displayMessage("✅ Configuración sincronizada", 'success');
        } else {
            displayMessage(data?.message || "Error al guardar", 'error');
        }
        return data;
    } catch (err) {
        displayMessage("Error crítico de conexión", 'error');
        return { success: false };
    } finally {
        // Mantener el escudo un segundo para que el socket no nos gane
        setTimeout(() => { isSavingConfig = false; }, 1000);
    }
}

/**
 * Activa o desactiva una estrategia (Long, Short o AI)
 */
export async function toggleBotSideState(isRunning, side, providedConfig = null) {
    const sideKey = side.toLowerCase(); 
    const action = isRunning ? 'stop' : 'start';
    
    let btnId;
    if (sideKey === 'long') btnId = 'austartl-btn';
    else if (sideKey === 'short') btnId = 'austarts-btn';
    else if (sideKey === 'ai') btnId = 'btn-start-ai'; 

    const btn = document.getElementById(btnId);

    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50');
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
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50');
        }
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