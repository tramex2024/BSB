/**
 * apiService.js - Comunicaciones REST Sincronizadas (2026)
 * Versión: Auditoría Final - Integración completa con getSanitizedValue
 */
import { displayMessage, getSanitizedValue } from './uiManager.js';
import { BACKEND_URL, logStatus, currentBotState } from '../main.js';

// Control transaccional real libre de temporizadores arbitrarios
export let isSavingConfig = false;
export let inTransitConfig = null; 
export let socketIsActive = false;

const MINIMOS = {
    amount: 6.0,
    purchase: 6.0,
    variation: 0.1,
    profit: 0.1,
    step: 0
};

export function setSocketActive(status) {
    socketIsActive = status;
}

/**
 * 🛡️ VALIDADOR DE RECONOCIMIENTO (Acknowledge Engine)
 * Evalúa si el estado enviado por el WebSocket ya refleja los cambios del cliente.
 */
export function checkConfigAcknowledgment(incomingConfig) {
    if (!inTransitConfig) return true;

    const isMatching = (
        Math.abs((incomingConfig.long?.amountUsdt || 0) - (inTransitConfig.long?.amountUsdt || 0)) < 0.000001 &&
        Math.abs((incomingConfig.long?.purchaseUsdt || 0) - (inTransitConfig.long?.purchaseUsdt || 0)) < 0.000001 &&
        Math.abs((incomingConfig.long?.price_var || 0) - (inTransitConfig.long?.price_var || 0)) < 0.000001 &&
        Math.abs((incomingConfig.long?.profit_percent || 0) - (inTransitConfig.long?.profit_percent || 0)) < 0.000001 &&
        Math.abs((incomingConfig.short?.amountUsdt || 0) - (inTransitConfig.short?.amountUsdt || 0)) < 0.000001 &&
        Math.abs((incomingConfig.short?.purchaseUsdt || 0) - (inTransitConfig.short?.purchaseUsdt || 0)) < 0.000001 &&
        Math.abs((incomingConfig.short?.price_var || 0) - (inTransitConfig.short?.price_var || 0)) < 0.000001 &&
        Math.abs((incomingConfig.short?.profit_percent || 0) - (inTransitConfig.short?.profit_percent || 0)) < 0.000001 &&
        Math.abs((incomingConfig.ai?.amountUsdt || 0) - (inTransitConfig.ai?.amountUsdt || 0)) < 0.000001
    );

    if (isMatching) {
        console.log("🎯 [CONCORDANCIA]: El servidor se ha sincronizado con el cliente. Liberando cerraduras.");
        inTransitConfig = null;
        isSavingConfig = false;
    }
    return isMatching;
}

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

        return await response.json().catch(() => ({ 
            success: response.ok, 
            message: response.statusText 
        }));
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
 * 🛡️ RECOLECTA CONFIGURACIÓN DESDE EL DOM
 * Blindaje extremo: Asegura que el JSON resultante NUNCA contenga NaN
 */
export function getBotConfiguration() {
    const getNum = (id, path, minVal = 0) => {
        const sanitized = getSanitizedValue(id);
        const parts = path.split('.');
        const stateVal = parts.reduce((obj, key) => obj?.[key], currentBotState.config);

        // 1. Prioridad: Input del usuario (si está limpio)
        if (sanitized !== undefined && !isNaN(sanitized)) return sanitized;

        // 2. Prioridad: Valor del estado (casteado a float estricto)
        const parsedState = parseFloat(stateVal);
        if (!isNaN(parsedState) && isFinite(parsedState)) return parsedState;

        // 3. Fallback absoluto
        return minVal;
    };

    const getCheck = (id, path) => {
        const el = document.getElementById(id);
        if (!el) {
            const parts = path.split('.');
            return parts.reduce((obj, key) => obj?.[key], currentBotState.config) ?? false;
        }
        return el.checked;
    };

    const config = {
        symbol: "BTC_USDT",
        long: {
            amountUsdt:      getNum('auamountl-usdt', 'long.amountUsdt', MINIMOS.amount),
            purchaseUsdt:    getNum('aupurchasel-usdt', 'long.purchaseUsdt', MINIMOS.purchase),
            price_var:       getNum('audecrementl', 'long.price_var', MINIMOS.variation), 
            profit_percent:  getNum('autriggerl', 'long.profit_percent', MINIMOS.profit), 
            size_var:        getNum('auincrementl', 'long.size_var', 1),
            //price_step_inc:  getNum('aupricestep-l', 'long.price_step_inc', MINIMOS.step),
            stopAtCycle:     getCheck('au-stop-long-at-cycle', 'long.stopAtCycle'),
            enabled:         currentBotState.lstate !== 'STOPPED'
        },
        short: {
            amountUsdt:      getNum('auamounts-usdt', 'short.amountUsdt', MINIMOS.amount),
            purchaseUsdt:    getNum('aupurchases-usdt', 'short.purchaseUsdt', MINIMOS.purchase),
            price_var:       getNum('audecrements', 'short.price_var', MINIMOS.variation), 
            profit_percent:  getNum('autriggers', 'short.profit_percent', MINIMOS.profit), 
            size_var:        getNum('auincrements', 'short.size_var', 1),
            //price_step_inc:  getNum('aupricestep-s', 'short.price_step_inc', MINIMOS.step),
            stopAtCycle:     getCheck('au-stop-short-at-cycle', 'short.stopAtCycle'),
            enabled:         currentBotState.sstate !== 'STOPPED' 
        },
        ai: {
            amountUsdt:      getNum('auamountai-usdt', 'ai.amountUsdt', 100) || getNum('ai-amount-usdt', 'ai.amountUsdt', 100),
            stopAtCycle:     getCheck('au-stop-ai-at-cycle', 'ai.stopAtCycle') || getCheck('ai-stop-at-cycle', 'ai.stopAtCycle'),
            enabled:         currentBotState.config?.ai?.enabled || false
        }
    };
    
    return config;
}

/**
 * SINCRONIZA LA CONFIGURACIÓN CON EL BACKEND
 */
export async function sendConfigToBackend(manualPayload = null) {
    const botConfig = getBotConfiguration();
    
    isSavingConfig = true; 
    inTransitConfig = botConfig;
    
    // Log de seguridad antes de enviar
    console.log("📤 Enviando config (blindada):", botConfig);

    const payload = manualPayload || { config: botConfig };

    try {
        const data = await privateFetch('/api/v1/config/update-config', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!data || !data.success) {
            inTransitConfig = null;
            isSavingConfig = false;
        } else {
            console.log("💾 HTTP: Configuración guardada con éxito.");
        }
        return data;
    } catch (err) {
        console.error("❌ Error al sincronizar configuración:", err);
        inTransitConfig = null;
        isSavingConfig = false;
        return { success: false };
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

export async function fetchRawTradeCycles(strategy = 'all') {
    try {
        const response = await privateFetch(`/api/v1/analytics/cycles?strategy=${strategy}`);
        if (response && response.success) {
            return response.data || [];
        }
        return [];
    } catch (err) {
        console.error("❌ Error en apiService:", err);
        return [];
    }
}