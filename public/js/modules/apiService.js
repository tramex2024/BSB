// public/js/modules/apiService.js

/**
 * apiService.js - Comunicaciones REST Sincronizadas (2026)
 * Auditado: Corrección de estructura POST y manejo inteligente de pestañas
 */
import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus, currentBotState } from '../main.js';

// 🛡️ ESCUDO: Evita que el Socket sobrescriba la UI mientras guardamos
export let isSavingConfig = false;

// --- CONFIGURACIÓN DE MÍNIMOS (Mantenidos para validación, pero sin bloqueo de escritura) ---
const MINIMOS = {
    amount: 6.0,
    purchase: 6.0,
    variation: 0.1,
    profit: 0.1,
    step: 0
};

/**
 * Función base para peticiones privadas
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
 * Recolecta la configuración de la UI de forma inteligente
 */
export function getBotConfiguration() {
    const getNum = (id, path, minVal = 0) => {
        const el = document.getElementById(id);
        
        // 🛡️ Si el elemento no está en el DOM (otra pestaña), rescatamos del estado global
        if (!el) {
            const parts = path.split('.');
            return currentBotState.config?.[parts[0]]?.[parts[1]] ?? minVal;
        }
        
        let rawValue = el.value.trim();
        let val;

        if (rawValue === "") {
            const parts = path.split('.');
            val = currentBotState.config?.[parts[0]]?.[parts[1]] ?? minVal;
        } else {
            val = parseFloat(rawValue.replace(/[^0-9.-]+/g,""));
        }

        // Devolvemos el valor sin forzar el input visualmente para no interrumpir al usuario
        return isNaN(val) ? minVal : val;
    };

    const getCheck = (id, path) => {
        const el = document.getElementById(id);
        if (!el) {
            const parts = path.split('.');
            return currentBotState.config?.[parts[0]]?.[parts[1]] ?? false;
        }
        return el.checked;
    };

    return {
        symbol: "BTC_USDT",
        long: {
            amountUsdt: getNum('auamountl-usdt', 'long.amountUsdt', MINIMOS.amount),
            purchaseUsdt: getNum('aupurchasel-usdt', 'long.purchaseUsdt', MINIMOS.purchase),
            price_var: getNum('auincrementl', 'long.price_var', MINIMOS.variation),
            size_var: getNum('audecrementl', 'long.size_var', MINIMOS.variation),
            profit_percent: getNum('autriggerl', 'long.profit_percent', MINIMOS.profit),
            price_step_inc: getNum('aupricestep-l', 'long.price_step_inc', MINIMOS.step),
            stopAtCycle: getCheck('au-stop-long-at-cycle', 'long.stopAtCycle'),
            enabled: currentBotState.lstate !== 'STOPPED'
        },
        short: {
            amountUsdt: getNum('auamounts-usdt', 'short.amountUsdt', MINIMOS.amount),
            purchaseUsdt: getNum('aupurchases-usdt', 'short.purchaseUsdt', MINIMOS.purchase),
            price_var: getNum('auincrements', 'short.price_var', MINIMOS.variation),
            size_var: getNum('audecrements', 'short.size_var', MINIMOS.variation),
            profit_percent: getNum('autriggers', 'short.profit_percent', MINIMOS.profit),
            price_step_inc: getNum('aupricestep-s', 'short.price_step_inc', MINIMOS.step),
            stopAtCycle: getCheck('au-stop-short-at-cycle', 'short.stopAtCycle'),
            enabled: currentBotState.sstate !== 'STOPPED' 
        },
        ai: {
            amountUsdt: getNum('auamountai-usdt', 'ai.amountUsdt', MINIMOS.amount) || getNum('ai-amount-usdt', 'ai.amountUsdt', MINIMOS.amount),
            stopAtCycle: getCheck('au-stop-ai-at-cycle', 'ai.stopAtCycle') || getCheck('ai-stop-at-cycle', 'ai.stopAtCycle'),
            enabled: currentBotState.config?.ai?.enabled || false
        }
    };
}

/**
 * Envía la configuración al Backend bloqueando actualizaciones de socket
 */
export async function sendConfigToBackend() {
    const configData = getBotConfiguration();
    isSavingConfig = true; 
    
    try {
        const data = await privateFetch('/api/autobot/update-config', {
            method: 'POST',
            body: JSON.stringify({ config: configData }) // ✅ CORREGIDO: Envuelto en propiedad 'config'
        });

        if (data && data.success) {
            // Log silencioso para no molestar durante la edición
            console.log("💾 Configuración sincronizada en DB");
        } else {
            console.warn("⚠️ Fallo en sincronización:", data?.message);
        }
        return data;
    } catch (err) {
        return { success: false };
    } finally {
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