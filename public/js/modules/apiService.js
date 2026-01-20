/**
 * apiService.js - Comunicaciones REST
 * Sincronizado con la Arquitectura Plana 2026 y Motor Exponencial
 */
import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus } from '../main.js';

/**
 * Función base para peticiones privadas
 * Corregida para no perder datos cuando el backend no envía la propiedad .data
 */
async function privateFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) return { success: false, message: "Sesión no encontrada." };

    // AbortController para evitar peticiones colgadas
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

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
        
        const result = await response.json().catch(() => ({ success: response.ok }));
        
        if (response.status === 401) {
            logStatus("⚠️ Sesión expirada.", "error");
            return { success: false, message: "Unauthorized" };
        }
        
        // Manejo de la estructura de respuesta según el endpoint
        // Si el backend responde con { success: true, data: {...} } devolvemos data
        if (result.success && result.data !== undefined) return result.data;
        
        // Si no, devolvemos el objeto completo (útil para success: true directo)
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

// --- SECCIÓN: DASHBOARD & ESTADÍSTICAS ---

export async function fetchCycleKpis(strategy = 'Long') {
    return await privateFetch(`/api/v1/analytics/stats?strategy=${strategy}`); 
}

export async function fetchEquityCurveData(strategy = 'Long') {
    return await privateFetch(`/api/v1/analytics/equity-curve?strategy=${strategy}`);
}

// --- SECCIÓN: CONFIGURACIÓN Y CONTROL DEL BOT ---

/**
 * Extrae la configuración actual de los inputs de la UI.
 * ✅ Sincronizado con siglas raíz: profit_percent y price_step_inc para lógica exponencial
 */
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
            price_step_inc: getNum('aupricestep-l'), // Factor exponencial
            stopAtCycle: getCheck('au-stop-long-at-cycle'),
            enabled: true
        },
        short: {
            amountUsdt: getNum('auamounts-usdt'),
            purchaseUsdt: getNum('aupurchases-usdt'),
            price_var: getNum('audecrements'),
            size_var: getNum('auincrements'),
            profit_percent: getNum('autriggers'),   
            price_step_inc: getNum('aupricestep-s'), // Factor exponencial
            stopAtCycle: getCheck('au-stop-short-at-cycle'),
            enabled: true
        }
    };
}

/**
 * Activa o desactiva una de las estrategias (Long o Short).
 * Sincronizado para evitar el efecto "F5" y proteger la lógica exponencial.
 */
export async function toggleBotSideState(isRunning, side, providedConfig = null) {
    const action = isRunning ? 'stop' : 'start';
    const endpoint = `/api/autobot/${action}/${side}`;
    
    // 1. Recolectamos la configuración (incluyendo los campos exponenciales)
    const config = providedConfig || getBotConfiguration();

    const btnId = side === 'long' ? 'austartl-btn' : 'austarts-btn';
    const btn = document.getElementById(btnId);
    
    // Bloqueo preventivo del botón durante la petición
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    logStatus(`⏳ Solicitando ${action.toUpperCase()} para ${side.toUpperCase()}...`, "info");

    try {
        const data = await privateFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify({ config }) 
        });

        // 2. Validación de éxito
        if (data && (data.success === true || data === true)) { 
            const msg = data.message || `${side.toUpperCase()} ${isRunning ? 'detenido' : 'iniciado'}`;
            
            // --- ACTUALIZACIÓN OPTIMISTA (Evita el F5) ---
            const { updateControlsState } = await import('./uiManager.js');
            
            // Creamos un mini-estado con el nuevo lstate/sstate para forzar el cambio visual
            const newState = {
                lstate: side === 'long' ? (isRunning ? 'STOPPED' : 'RUNNING') : undefined,
                sstate: side === 'short' ? (isRunning ? 'STOPPED' : 'RUNNING') : undefined
            };
            
            // Si el backend nos devolvió el estado real, lo usamos, si no, usamos el estimado
            const finalState = data.data ? data.data : newState;
            updateControlsState(finalState);
            // --------------------------------------------

            displayMessage(msg, 'success');
            logStatus(`✅ ${msg}`, "success");
            return data;
        } else {
            const errorMsg = data?.message || 'Error desconocido en el servidor';
            displayMessage(`Error: ${errorMsg}`, 'error');
            logStatus(`❌ Falló ${action}: ${errorMsg}`, "error");
            return data;
        }
    } catch (err) {
        console.error(`Error crítico en toggleBotSideState (${side}):`, err);
        displayMessage("Error de conexión con el servidor", "error");
        logStatus(`❌ Error crítico en comunicación`, "error");
        return { success: false };
    } finally {
        // Liberamos el botón tras la respuesta
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}