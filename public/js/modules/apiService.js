// public/js/modules/apiService.js
// public/js/modules/apiService.js
import { displayMessage } from './uiManager.js';
import { TRADE_SYMBOL_BITMART, BACKEND_URL } from '../main.js';

/**
 * Función auxiliar privada para realizar peticiones autenticadas
 * Centraliza el uso del token y el manejo de errores de red.
 */
async function privateFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) return { success: false, message: "Sesión no encontrada. Inicie sesión de nuevo." };

    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    try {
        const response = await fetch(`${BACKEND_URL}${endpoint}`, { ...defaultOptions, ...options });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error en la petición a ${endpoint}:`, error);
        return { success: false, message: "Error de conexión con el servidor." };
    }
}

/**
 * 1. RECOPILACIÓN DE CONFIGURACIÓN
 * Extrae los valores de los inputs del DOM para enviarlos al backend.
 */
export function getBotConfiguration() {
    const getNum = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const getCheck = (id) => document.getElementById(id)?.checked || false;

    return {
        symbol: TRADE_SYMBOL_BITMART,
        long: {
            balanceUsdt: getNum('auamount-usdt'),
            purchaseUsdt: getNum('aupurchase-usdt'),
            increment: getNum('auincrement'),
            decrement: getNum('audecrement'),
            trigger: getNum('autrigger'),
        },
        short: {
            balanceBtc: getNum('auamount-btc'),
            purchaseBtc: getNum('aupurchase-btc'),
            increment: getNum('auincrement'),
            decrement: getNum('audecrement'),
            trigger: getNum('autrigger'),
        },
        options: {
            stopAtCycle: getCheck('au-stop-at-cycle-end'),
        }
    };
}

/**
 * 2. GUARDADO AUTOMÁTICO (Auto-save)
 * Se llama cada vez que el usuario escribe en un input.
 */
export async function sendConfigToBackend() {
    const config = getBotConfiguration();
    
    // No usamos displayMessage aquí para no molestar al usuario mientras escribe
    const data = await privateFetch('/api/autobot/update-config', {
        method: 'POST',
        body: JSON.stringify({ config })
    });

    if (!data.success) {
        console.warn('Advertencia en auto-guardado:', data.message);
    }
}

/**
 * 3. CONTROL DE ESTADO (Start/Stop)
 * Envía la señal para encender o apagar el motor del bot.
 */
export async function toggleBotState(isRunning) {
    const endpoint = isRunning ? '/api/autobot/stop' : '/api/autobot/start';
    const config = isRunning ? {} : getBotConfiguration();

    // Bloqueamos el botón desde aquí para evitar doble click
    const btn = document.getElementById('austart-btn');
    if (btn) btn.disabled = true;

    const data = await privateFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ config })
    });

    if (data.success) {
        displayMessage(`Bot ${isRunning ? 'detenido' : 'iniciado'} correctamente.`, 'success');
    } else {
        displayMessage(`Error: ${data.message}`, 'error');
    }

    if (btn) btn.disabled = false;
    return data;
}

/**
 * 4. ANALÍTICAS (Curva de Capital y KPIs)
 */
export async function fetchEquityCurveData() {
    const data = await privateFetch('/api/v1/analytics/equity-curve');
    return data.success ? data.data : (Array.isArray(data) ? data : []);
}

export async function fetchCycleKpis() {
    const data = await privateFetch('/api/v1/analytics/kpis');
    if (data.success) return data.data;
    return Array.isArray(data) ? (data[0] || data) : { averageProfitPercentage: 0, totalCycles: 0 };
}