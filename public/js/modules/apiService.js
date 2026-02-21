// public/js/modules/apiService.js

/**
 * apiService.js - Comunicaciones REST Sincronizadas (2026)
 * Auditado: Corrección de inversión de PriceVar/SizeVar y rescate de estado global.
 */
import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus, currentBotState } from '../main.js';

// 🛡️ ESCUDO: Evita que el Socket sobrescriba la UI mientras guardamos
export let isSavingConfig = false;

// --- CONFIGURACIÓN DE MÍNIMOS ---
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

        return await response.json(); 

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
 * Recolecta la configuración de la UI de forma inteligente.
 * CORREGIDO: Inversión de Price Var y Size Var detectada en el HTML.
 */
export function getBotConfiguration() {
    const getNum = (id, path, minVal = 0) => {
        const el = document.getElementById(id);
        
        // 🛡️ RESCATE: Si el elemento no existe (otra pestaña), rescatamos del estado global
        if (!el) {
            const parts = path.split('.');
            let savedVal = currentBotState.config;
            for (const part of parts) {
                if (savedVal) savedVal = savedVal[part];
            }
            return savedVal ?? minVal;
        }
        
        let rawValue = el.value.trim();
        if (rawValue === "") {
            const parts = path.split('.');
            let savedVal = currentBotState.config;
            for (const part of parts) {
                if (savedVal) savedVal = savedVal[part];
            }
            return savedVal ?? minVal;
        }

        const val = parseFloat(rawValue.replace(/[^0-9.-]+/g,""));
        return isNaN(val) ? minVal : val;
    };

    const getCheck = (id, path) => {
        const el = document.getElementById(id);
        if (!el) {
            const parts = path.split('.');
            let savedVal = currentBotState.config;
            for (const part of parts) {
                if (savedVal) savedVal = savedVal[part];
            }
            return savedVal ?? false;
        }
        return el.checked;
    };

    /**
     * NOTA TÉCNICA: En tu HTML:
     * id="auincrementl" es "Size Multiplier" -> Debe ir a size_var
     * id="audecrementl" es "Safety Drop" -> Debe ir a price_var
     */
    return {
        symbol: "BTC_USDT",
        long: {
            amountUsdt:      getNum('auamountl-usdt', 'long.amountUsdt', MINIMOS.amount),
            purchaseUsdt:    getNum('aupurchasel-usdt', 'long.purchaseUsdt', MINIMOS.purchase),
            price_var:       getNum('audecrementl', 'long.price_var', MINIMOS.variation), // Drop -> Price Var
            size_var:        getNum('auincrementl', 'long.size_var', 1),                // Multiplier -> Size Var
            profit_percent:  getNum('autriggerl', 'long.profit_percent', MINIMOS.profit),
            price_step_inc:  getNum('aupricestep-l', 'long.price_step_inc', MINIMOS.step),
            stopAtCycle:     getCheck('au-stop-long-at-cycle', 'long.stopAtCycle'),
            enabled:         currentBotState.lstate !== 'STOPPED'
        },
        short: {
            amountUsdt:      getNum('auamounts-usdt', 'short.amountUsdt', MINIMOS.amount),
            purchaseUsdt:    getNum('aupurchases-usdt', 'short.purchaseUsdt', MINIMOS.purchase),
            price_var:       getNum('audecrements', 'short.price_var', MINIMOS.variation), // Rise -> Price Var
            size_var:        getNum('auincrements', 'short.size_var', 1),                // Multiplier -> Size Var
            profit_percent:  getNum('autriggers', 'short.profit_percent', MINIMOS.profit),
            price_step_inc:  getNum('aupricestep-s', 'short.price_step_inc', MINIMOS.step),
            stopAtCycle:     getCheck('au-stop-short-at-cycle', 'short.stopAtCycle'),
            enabled:         currentBotState.sstate !== 'STOPPED' 
        },
        ai: {
            amountUsdt:      getNum('ai-amount-usdt', 'ai.amountUsdt', MINIMOS.amount),
            stopAtCycle:     getCheck('ai-stop-at-cycle', 'ai.stopAtCycle'),
            enabled:         currentBotState.aistate === 'RUNNING'
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
            body: JSON.stringify({ config: configData })
        });

        if (data && data.success) {
            console.log("💾 Configuración sincronizada en DB");
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
    
    let btnId = (sideKey === 'long') ? 'austartl-btn' : 
                (sideKey === 'short') ? 'austarts-btn' : 'btn-start-ai';

    const btn = document.getElementById(btnId);

    if (btn) {
        btn.disabled = true;
        btn.textContent = isRunning ? "STOPPING..." : "STARTING...";
    }

    try {
        // Obtenemos config blindada
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