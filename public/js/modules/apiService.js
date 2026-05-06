/**
 * apiService.js - Comunicaciones REST Sincronizadas (2026)
 * Versión: Optimizada para persistencia de datos y protección contra nulos.
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

/**
 * Motor de peticiones privado con manejo de tokens y timeouts
 */
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
 * Obtiene los ciclos de trading detallados para el motor de métricas.
 */
export async function fetchRawTradeCycles(strategy = 'all') {
    try {
        const data = await privateFetch(`/api/v1/analytics/cycles?strategy=${strategy}`);
        if (data && data.success) {
            // Normalizamos la respuesta para que siempre sea un Array
            return data.cycles || data.data || [];
        }
    } catch (err) {
        console.error("❌ Error fetching cycles:", err);
    }
    return [];
}

/**
 * RECOLECTA CONFIGURACIÓN
 * Mapea los IDs del HTML a las variables del servidor con fallback seguro.
 */
export function getBotConfiguration() {
    const getNum = (id, path, minVal = 0) => {
        const el = document.getElementById(id);
        const parts = path.split('.');
        const fallback = parts.reduce((obj, key) => obj?.[key], currentBotState.config) ?? minVal;
        
        if (!el) return fallback;
        
        let rawValue = el.value.trim();
        if (rawValue === "") return fallback;

        const val = parseFloat(rawValue.replace(/[^0-9.-]+/g,""));
        return isNaN(val) ? fallback : val;
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
            amountUsdt:      getNum('auamountl-usdt', 'long.amountUsdt', MINIMOS.amount),
            purchaseUsdt:    getNum('aupurchasel-usdt', 'long.purchaseUsdt', MINIMOS.purchase),
            price_var:       getNum('audecrementl', 'long.price_var', MINIMOS.variation),
            profit_percent:  getNum('autriggerl', 'long.profit_percent', MINIMOS.profit),
            size_var:        getNum('auincrementl', 'long.size_var', 1),
            price_step_inc:  getNum('aupricestep-l', 'long.price_step_inc', MINIMOS.step),
            stopAtCycle:     getCheck('au-stop-long-at-cycle', 'long.stopAtCycle'),
            enabled:         currentBotState.lstate !== 'STOPPED'
        },
        short: {
            amountUsdt:      getNum('auamounts-usdt', 'short.amountUsdt', MINIMOS.amount),
            purchaseUsdt:    getNum('aupurchases-usdt', 'short.purchaseUsdt', MINIMOS.purchase),
            price_var:       getNum('audecrements', 'short.price_var', MINIMOS.variation),
            profit_percent:  getNum('autriggers', 'short.profit_percent', MINIMOS.profit),
            size_var:        getNum('auincrements', 'short.size_var', 1),
            price_step_inc:  getNum('aupricestep-s', 'short.price_step_inc', MINIMOS.step),
            stopAtCycle:     getCheck('au-stop-short-at-cycle', 'short.stopAtCycle'),
            enabled:         currentBotState.sstate !== 'STOPPED' 
        },
        ai: {
            amountUsdt:      getNum('ai-amount-usdt', 'ai.amountUsdt', 100),
            stopAtCycle:     getCheck('ai-stop-at-cycle', 'ai.stopAtCycle'),
            enabled:         currentBotState.config?.ai?.enabled || false
        }
    };
}

/**
 * Sincroniza la configuración con el Backend (V1)
 */
export async function sendConfigToBackend(manualPayload = null) {
    const payload = manualPayload || { config: getBotConfiguration() };
    isSavingConfig = true; 
    
    try {
        const data = await privateFetch('/api/v1/config/update-config', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (data && data.success) {
            logStatus("💾 Configuración sincronizada", "success");
        }
        return data;
    } catch (err) {
        console.error("❌ Error de sincronización:", err);
        return { success: false };
    } finally {
        setTimeout(() => { isSavingConfig = false; }, 500);
    }
}

/**
 * Control de Encendido/Apagado por lado
 */
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
        // Nota: Estas rutas suelen estar bajo /api/autobot o /api/v1/bot dependiendo de tu backend
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