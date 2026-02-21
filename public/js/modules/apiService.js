// public/js/modules/apiService.js

/**
 * apiService.js - Comunicaciones REST con Blindaje de Mínimos (2026)
 * Sincronizado con el Modelo de Mongoose y Protección de UI
 */
import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus, currentBotState } from '../main.js';

// 🛡️ ESCUDO: Evita que el Socket sobrescriba la UI mientras guardamos
export let isSavingConfig = false;

// --- CONFIGURACIÓN DE MÍNIMOS (Espejo del Modelo de Mongoose) ---
const MINIMOS = {
    amount: 6.0,      // Mínimo para Amount USDT
    purchase: 6.0,    // Mínimo para Purchase USDT
    variation: 0.1,   // Mínimo para price_var y size_var
    profit: 0.1,      // Mínimo para profit_percent
    step: 0           // price_step_inc permitido en 0
};

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
 * Recolecta la configuración de la UI con validación de umbrales mínimos
 */
export function getBotConfiguration() {
    const getNum = (id, path, minVal = 0) => {
        const el = document.getElementById(id);
        if (!el) return minVal;
        
        let rawValue = el.value.trim();
        let val;

        // 1. Manejo de campo vacío: Rescatar del estado global para no enviar 0
        if (rawValue === "") {
            const parts = path.split('.');
            val = currentBotState.config?.[parts[0]]?.[parts[1]] || minVal;
        } else {
            val = parseFloat(rawValue.replace(/[^0-9.-]+/g,""));
        }

        // 2. BLINDAJE: Si es NaN o menor al mínimo, forzar el mínimo de seguridad
        if (isNaN(val) || val < minVal) {
            console.warn(`🛡️ Ajuste preventivo en ${id}: ${val} -> ${minVal}`);
            // Actualizamos visualmente para que el usuario sepa que se corrigió
            if (el.value !== "") el.value = minVal; 
            return minVal;
        }

        return val;
    };

    const getCheck = (id) => document.getElementById(id)?.checked || false;

    return {
        symbol: "BTC_USDT",
        long: {
            amountUsdt: getNum('auamountl-usdt', 'long.amountUsdt', MINIMOS.amount),
            purchaseUsdt: getNum('aupurchasel-usdt', 'long.purchaseUsdt', MINIMOS.purchase),
            price_var: getNum('auincrementl', 'long.price_var', MINIMOS.variation),
            size_var: getNum('audecrementl', 'long.size_var', MINIMOS.variation),
            profit_percent: getNum('autriggerl', 'long.profit_percent', MINIMOS.profit),
            price_step_inc: getNum('aupricestep-l', 'long.price_step_inc', MINIMOS.step),
            stopAtCycle: getCheck('au-stop-long-at-cycle'),
            enabled: currentBotState.lstate !== 'STOPPED'
        },
        short: {
            amountUsdt: getNum('auamounts-usdt', 'short.amountUsdt', MINIMOS.amount),
            purchaseUsdt: getNum('aupurchases-usdt', 'short.purchaseUsdt', MINIMOS.purchase),
            price_var: getNum('auincrements', 'short.price_var', MINIMOS.variation),
            size_var: getNum('audecrements', 'short.size_var', MINIMOS.variation),
            profit_percent: getNum('autriggers', 'short.profit_percent', MINIMOS.profit),
            price_step_inc: getNum('aupricestep-s', 'short.price_step_inc', MINIMOS.step),
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: currentBotState.sstate !== 'STOPPED' 
        },
        ai: {
            amountUsdt: getNum('auamountai-usdt', 'ai.amountUsdt', MINIMOS.amount) || getNum('ai-amount-usdt', 'ai.amountUsdt', MINIMOS.amount),
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
    
    // El escudo se activa antes de la petición para ignorar rebotes de socket
    isSavingConfig = true; 
    
    try {
        const data = await privateFetch('/api/autobot/update-config', {
            method: 'POST',
            body: JSON.stringify( config )
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
        // Mantenemos el escudo activo 1 segundo extra para asegurar que el socket se calme
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