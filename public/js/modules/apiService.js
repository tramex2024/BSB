/**
 * apiService.js - REST Communications
 * Optimized to coexist with Sockets 2026
 */
import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus, currentBotState } from '../main.js';

// 🛡️ SHIELD: Prevents Socket from overwriting UI while user is editing
export let isSavingConfig = false;
let savingTimeout = null;

/**
 * Base function for private fetch requests
 */
async function privateFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        return { success: false, message: "Session not found." };
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
            window.location.reload(); // Force re-login if token expires
            return { success: false, message: "Unauthorized" };
        }

        return await response.json(); 

    } catch (error) {
        if (error.name === 'AbortError') logStatus("❌ API Timeout", "error");
        return { success: false, message: error.message };
    }
}

// --- SECTION: ANALYTICS ---

export async function fetchCycleKpis(strategy = 'all') {
    return await privateFetch(`/api/v1/analytics/stats?strategy=${strategy}`); 
}

export async function fetchEquityCurveData(strategy = 'all') {
    return await privateFetch(`/api/v1/analytics/equity-curve?strategy=${strategy}`);
}

// --- SECTION: CONFIGURATION & CONTROL ---

/**
 * Collects configuration from UI inputs
 */
export function getBotConfiguration() {
    const getNum = (id, path) => {
        const el = document.getElementById(id);
        if (!el) return 0;
        
        const rawValue = el.value.trim();
        // If empty, fallback to current global state to avoid zeroing out config
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
            enabled: currentBotState.config?.long?.enabled || false
        },
        short: {
            amountUsdt: getNum('auamounts-usdt', 'short.amountUsdt'),
            purchaseUsdt: getNum('aupurchases-usdt', 'short.purchaseUsdt'),
            price_var: getNum('audecrements', 'short.price_var'),
            size_var: getNum('auincrements', 'short.size_var'),
            profit_percent: getNum('autriggers', 'short.profit_percent'),   
            price_step_inc: getNum('aupricestep-s', 'short.price_step_inc'), 
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: currentBotState.config?.short?.enabled || false
        },
        ai: {
            amountUsdt: getNum('auamountai-usdt', 'ai.amountUsdt') || getNum('ai-amount-usdt', 'ai.amountUsdt'),
            stopAtCycle: getCheck('ai-stop-at-cycle') || getCheck('au-stop-ai-at-cycle'),
            enabled: currentBotState.config?.ai?.enabled || false
        }
    };
}

/**
 * Sends configuration to Backend with temporary Socket shield
 */
export async function sendConfigToBackend() {
    const config = getBotConfiguration();
    
    // Safety check for minimum exchange requirements
    if ((config.long.amountUsdt > 0 && config.long.amountUsdt < 5) || 
        (config.short.amountUsdt > 0 && config.short.amountUsdt < 5)) {
        displayMessage("⚠️ Minimum amount is $5 USDT", 'warning');
        return { success: false };
    }

    // Activate shield
    isSavingConfig = true;
    if (savingTimeout) clearTimeout(savingTimeout);
    
    try {
        const data = await privateFetch('/api/autobot/update-config', {
            method: 'POST',
            body: JSON.stringify({ config })
        });

        if (data && data.success) {
            logStatus("✅ Configuration saved", "success");
        }
        return data;
    } catch (err) {
        return { success: false };
    } finally {
        // Hold the shield for 1s to allow socket state to stabilize
        savingTimeout = setTimeout(() => { isSavingConfig = false; }, 1000);
    }
}

/**
 * Engine Control (Long, Short or AI)
 */
export async function toggleBotSideState(isRunning, side, providedConfig = null) {
    const sideKey = side.toLowerCase(); 
    const action = isRunning ? 'stop' : 'start';
    
    // Visual feedback for all related buttons
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
            displayMessage(`${sideKey.toUpperCase()} ${action === 'start' ? 'STARTED' : 'STOPPED'}`, 'success');
            return data;
        } else {
            throw new Error(data?.message || 'Server error');
        }
    } catch (err) {
        displayMessage(err.message, 'error');
        return { success: false };
    }
}

/**
 * PANIC BUTTON
 */
export async function triggerPanicStop() {
    try {
        const data = await privateFetch('/api/autobot/panic-stop', { method: 'POST' });
        if (data.success) displayMessage("🚨 PANIC: Stopping all engines", 'error');
        return data;
    } catch (err) {
        displayMessage("Panic stop failed", 'error');
        return { success: false };
    }
}