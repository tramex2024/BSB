/**
 * apiService.js - Comunicaciones REST
 * Sincronizado con Motor Exponencial y Garantía de Desbloqueo de UI
 */
import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus } from '../main.js';

/**
 * Función base para peticiones privadas con Timeout y AbortController
 */
async function privateFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) return { success: false, message: "Sesión no encontrada." };

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
            return { success: false, message: "Unauthorized" };
        }

        const result = await response.json().catch(() => ({ success: response.ok }));
        if (result.success && result.data !== undefined) return result.data;
        return result; 

    } catch (error) {
        if (error.name === 'AbortError') {
            logStatus("❌ Tiempo de espera agotado", "error");
        } else {
            logStatus("❌ Error de red", "error");
        }
        return { success: false, message: error.message };
    }
}

// --- SECCIÓN: ANALYTICS (Para KPIs y Gráficos) ---

export async function fetchCycleKpis(strategy = 'Long') {
    return await privateFetch(`/api/v1/analytics/stats?strategy=${strategy}`); 
}

export async function fetchEquityCurveData(strategy = 'Long') {
    return await privateFetch(`/api/v1/analytics/equity-curve?strategy=${strategy}`);
}

// --- SECCIÓN: CONFIGURACIÓN Y CONTROL DEL BOT ---

export function getBotConfiguration() {
    const getNum = (id) => {
        const el = document.getElementById(id);
        return el ? parseFloat(el.value) || 0 : 0;
    };
    const getCheck = (id) => document.getElementById(id)?.checked || false;

    return {
        symbol: "BTC_USDT", 
        long: {
            amountUsdt: getNum('auamountl-usdt'),
            purchaseUsdt: getNum('aupurchasel-usdt'),
            price_var: getNum('audecrementl'),
            size_var: getNum('auincrementl'),
            profit_percent: getNum('autriggerl'),   
            price_step_inc: getNum('aupricestep-l'),
            stopAtCycle: getCheck('au-stop-long-at-cycle'),
            enabled: true
        },
        short: {
            amountUsdt: getNum('auamounts-usdt'),
            purchaseUsdt: getNum('aupurchases-usdt'),
            price_var: getNum('audecrements'),
            size_var: getNum('auincrements'),
            profit_percent: getNum('autriggers'),   
            price_step_inc: getNum('aupricestep-s'),
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: true
        },
        ai: {
            amountUsdt: getNum('auamountai-usdt'),
            stopAtCycle: getCheck('au-stop-ai-at-cycle'),
            enabled: true
        }
    };
}

/**
 * Persistencia: Guarda la configuración en el backend (La que faltaba)
 */
export async function sendConfigToBackend() {
    const config = getBotConfiguration();
    return await privateFetch('/api/autobot/update-config', {
        method: 'POST',
        body: JSON.stringify({ config })
    });
}

/**
 * Activa o desactiva una estrategia (Long, Short o AI).
 */
export async function toggleBotSideState(isRunning, side, providedConfig = null) {
    const action = isRunning ? 'stop' : 'start';
    const sideKey = side.toLowerCase(); 
    const endpoint = `/api/autobot/${action}/${sideKey}`;
    const config = providedConfig || getBotConfiguration();

    const btnMap = {
        'long': 'austartl-btn',
        'short': 'austarts-btn',
        'ai': 'austartai-btn'
    };
    
    const btn = document.getElementById(btnMap[sideKey]);
    
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.pointerEvents = "none";
        btn.textContent = "WAIT...";
    }

    logStatus(`⏳ Enviando orden ${action.toUpperCase()} para ${sideKey.toUpperCase()}...`, "info");

    try {
        const data = await privateFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify({ config }) 
        });

        if (data && (data.success === true || data === true)) { 
            const msg = data.message || `${sideKey.toUpperCase()} ${isRunning ? 'detenido' : 'iniciado'}`;
            displayMessage(msg, 'success');
            logStatus(`✅ ${msg}`, "success");
            return data;
        } else {
            const errorMsg = data?.message || 'Error en respuesta del servidor';
            displayMessage(`Error: ${errorMsg}`, 'error');
            logStatus(`❌ Falló ${action}: ${errorMsg}`, "error");
            return data;
        }
    } catch (err) {
        console.error(`Error en toggle (${sideKey}):`, err);
        displayMessage("Error de conexión", "error");
        return { success: false };
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.style.pointerEvents = "auto";
        }
    }
}