/**
 * apiService.js - Comunicaciones REST Sincronizadas (2026)
 * Versión: Auditoría Final + Control de Recálculo Integrado
 */
import { displayMessage, getSanitizedValue } from './uiManager.js';
import { BACKEND_URL, logStatus, currentBotState } from '../main.js';
import { mapConfigFromDOM } from './configMapper.js';
import { currentBotState } from '../main.js';

// Control transaccional real
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
 */
export function getBotConfiguration() {
    return mapConfigFromDOM(currentBotState);
}

/**
 * SINCRONIZA LA CONFIGURACIÓN CON EL BACKEND
 * @param {Object|null} manualPayload - Payload personalizado si es necesario
 * @param {Boolean} shouldRecalculate - Flag para indicar al backend si debe recalcular el grid
 */
/**
 * SINCRONIZA LA CONFIGURACIÓN CON EL BACKEND
 * Integra la capa de validación automática antes del envío.
 */
export async function sendConfigToBackend(manualPayload = null, shouldRecalculate = false) {
    try {
        // 1. Obtención y Validación (Esto disparará el error si la config no es segura)
        const botConfig = getBotConfiguration();
        
        isSavingConfig = true; 
        inTransitConfig = botConfig;
        
        // 2. Construcción del Payload
        const payload = manualPayload || { 
            config: botConfig, 
            recalculate: shouldRecalculate 
        };

        console.log(`📤 Enviando config (blindada, recalc=${payload.recalculate || 'false'}):`, payload);

        // 3. Envío al Backend
        const data = await privateFetch('/api/v1/config/update-config', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        // 4. Gestión de respuesta
        if (!data || !data.success) {
            inTransitConfig = null;
            isSavingConfig = false;
        } else {
            console.log("💾 HTTP: Configuración guardada con éxito.");
        }
        
        return data;

    } catch (err) {
        // Captura errores de validación (del mapper) o errores de red
        console.error("❌ Error al sincronizar configuración:", err);
        
        // Si el error es de validación, se lo mostramos al usuario
        if (typeof displayMessage === 'function') {
            displayMessage(err.message || "Error al procesar configuración", 'error');
        }

        inTransitConfig = null;
        isSavingConfig = false;
        return { success: false, message: err.message };
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