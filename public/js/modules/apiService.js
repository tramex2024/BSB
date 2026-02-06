// public/js/modules/apiService.js

/**
 * apiService.js - Comunicaciones REST
 * Optimizado para coexistir con Sockets 2026
 */
import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus, currentBotState } from '../main.js';

// 🛡️ ESCUDO: Evita que el Socket sobrescriba la UI mientras el usuario edita
export let isSavingConfig = false;
let savingTimeout = null;

/**
 * Función base para peticiones privadas
 */
async function privateFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        return { success: false, message: "Sesión no encontrada." };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); 

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
            localStorage.removeItem('token');
            window.location.reload(); // Forzar re-login si el token muere
            return { success: false, message: "Unauthorized" };
        }

        return await response.json(); 

    } catch (error) {
        if (error.name === 'AbortError') logStatus("❌ Timeout en API", "error");
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

// --- SECCIÓN: CONFIGURACIÓN Y CONTROL ---

/**
 * Recolecta la configuración de la UI
 */
export function getBotConfiguration() {
    const getNum = (id, path) => {
        const el = document.getElementById(id);
        if (!el) return 0;
        
        const rawValue = el.value.trim();
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
            price_var: getNum('audecrementl', 'long.price_var'),
            size_var: getNum('auincrementl', 'long.size_var'),
            profit_percent: getNum('autriggerl', 'long.profit_percent'),   
            price_step_inc: getNum('aupricestep-l', 'long.price_step_inc'), 
            stopAtCycle: getCheck('au-stop-long-at-cycle'),
            enabled: currentBotState.config.long.enabled // Preservar estado de ejecución
        },
        short: {
            amountUsdt: getNum('auamounts-usdt', 'short.amountUsdt'),
            purchaseUsdt: getNum('aupurchases-usdt', 'short.purchaseUsdt'),
            price_var: getNum('audecrements', 'short.price_var'),
            size_var: getNum('auincrements', 'short.size_var'),
            profit_percent: getNum('autriggers', 'short.profit_percent'),   
            price_step_inc: getNum('aupricestep-s', 'short.price_step_inc'), 
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: currentBotState.config.short.enabled
        },
        ai: {
            amountUsdt: getNum('auamountai-usdt', 'ai.amountUsdt') || getNum('ai-amount-usdt', 'ai.amountUsdt'),
            stopAtCycle: getCheck('ai-stop-at-cycle') || getCheck('au-stop-ai-at-cycle'),
            enabled: currentBotState.config.ai.enabled
        }
    };
}

/**
 * Envía la configuración al Backend bloqueando temporalmente al Socket
 */
export async function sendConfigToBackend() {
    const config = getBotConfiguration();
    
    if ((config.long.amountUsdt > 0 && config.long.amountUsdt < 5) || 
        (config.short.amountUsdt > 0 && config.short.amountUsdt < 5)) {
        displayMessage("⚠️ El monto mínimo es $5", 'warning');
        return { success: false };
    }

    // Activar escudo
    isSavingConfig = true;
    if (savingTimeout) clearTimeout(savingTimeout);
    
    try {
        const data = await privateFetch('/api/autobot/update-config', {
            method: 'POST',
            body: JSON.stringify({ config })
        });

        if (data && data.success) {
            logStatus("✅ Configuración guardada", "success");
        }
        return data;
    } catch (err) {
        return { success: false };
    } finally {
        // El escudo se mantiene un momento para esperar a que el socket de vuelta con el nuevo estado
        savingTimeout = setTimeout(() => { isSavingConfig = false; }, 1000);
    }
}

/**
 * Control de Motores (Long, Short o AI)
 */
export async function toggleBotSideState(isRunning, side, providedConfig = null) {
    const sideKey = side.toLowerCase(); 
    const action = isRunning ? 'stop' : 'start';
    
    // Identificar botón (Dashboard o Tab)
    const btnIds = {
        long: ['austartl-btn'],
        short: ['austarts-btn'],
        ai: ['btn-start-ai', 'austartai-btn']
    };

    const targets = btnIds[sideKey] || [];
    targets.forEach(id => {
        const b = document.getElementById(id);
        if (b) { b.disabled = true; b.textContent = "..."; }
    });

    try {
        const config = providedConfig || getBotConfiguration();
        const data = await privateFetch(`/api/autobot/${action}/${sideKey}`, {
            method: 'POST',
            body: JSON.stringify({ config }) 
        });

        if (data && data.success) {
            displayMessage(`${sideKey.toUpperCase()} ${action === 'start' ? 'Iniciado' : 'Detenido'}`, 'success');
            return data;
        } else {
            throw new Error(data?.message || 'Error en respuesta');
        }
    } catch (err) {
        displayMessage(err.message, 'error');
        return { success: false };
    } finally {
        // No rehabilitamos botones aquí manualmente, dejamos que el SOCKET lo haga al recibir el nuevo estado
    }
}

/**
 * BOTÓN DE PÁNICO
 */
export async function triggerPanicStop() {
    try {
        const data = await privateFetch('/api/autobot/panic-stop', { method: 'POST' });
        if (data.success) displayMessage("🚨 PÁNICO: Deteniendo todo", 'error');
        return data;
    } catch (err) {
        displayMessage("Error en parada de pánico", 'error');
        return { success: false };
    }
}