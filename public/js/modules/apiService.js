/**
 * apiService.js - Comunicaciones REST
 * Sincronizado con la Arquitectura Plana 2026 y Motor Exponencial
 */
import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus } from '../main.js';

/**
 * Función base para peticiones privadas
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
        
        const result = await response.json().catch(() => ({ success: response.ok }));
        
        if (response.status === 401) {
            logStatus("⚠️ Sesión expirada.", "error");
            return { success: false, message: "Unauthorized" };
        }
        
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
        }
    };
}

/**
 * Activa o desactiva una de las estrategias (Long o Short).
 * PASO 4: Se elimina la actualización visual directa para confiar en el Socket.
 */
export async function toggleBotSideState(isRunning, side, providedConfig = null) {
    const action = isRunning ? 'stop' : 'start';
    const endpoint = `/api/autobot/${action}/${side}`;
    
    const config = providedConfig || getBotConfiguration();

    const btnId = side === 'long' ? 'austartl-btn' : 'austarts-btn';
    const btn = document.getElementById(btnId);
    
    // Bloqueo preventivo (Paso 3 parcial: deshabilitar durante carga)
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

        if (data && (data.success === true || data === true)) { 
            const msg = data.message || `${side.toUpperCase()} ${isRunning ? 'detenido' : 'iniciado'}`;
            
            // ✅ PASO 4: Ya no llamamos a updateControlsState aquí.
            // Esperamos a que el Socket oficial envíe el cambio desde el servidor.

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
        // Liberamos el botón tras la respuesta de la red
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}