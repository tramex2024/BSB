// public/js/modules/apiService.js
import { displayMessage } from './uiManager.js';
import { TRADE_SYMBOL_BITMART, BACKEND_URL } from '../main.js';

/**
 * Función centralizada para peticiones seguras
 */
async function privateFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token'); // UNIFICADO: siempre 'token'
    if (!token) return { success: false, message: "No hay sesión activa" };

    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };

    try {
        const response = await fetch(`${BACKEND_URL}${endpoint}`, { ...defaultOptions, ...options });
        return await response.json();
    } catch (error) {
        console.error(`Error en ${endpoint}:`, error);
        return { success: false, message: "Error de conexión con el servidor" };
    }
}

/**
 * Obtiene la configuración actual desde los inputs del DOM
 */
export function getBotConfiguration() {
    const getNum = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const getCheck = (id) => document.getElementById(id)?.checked || false;

    // Esta estructura debe coincidir EXACTAMENTE con lo que tu Backend
    // espera para encriptar y guardar en MongoDB.
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
            stopAtCycleEnd: getCheck('au-stop-at-cycle-end'),
        }
    };
}

/**
 * Inicia o detiene el bot (Lógica consolidada de bot.js)
 */
export async function toggleBotState(isRunning) {
    const endpoint = isRunning ? '/api/autobot/stop' : '/api/autobot/start';
    const config = isRunning ? {} : getBotConfiguration();

    // Bloqueamos el botón visualmente antes de la petición
    const btn = document.getElementById('austart-btn');
    if (btn) btn.disabled = true;

    const data = await privateFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({ config })
    });

    if (data.success) {
        displayMessage(`Bot ${isRunning ? 'detenido' : 'iniciado'} correctamente`, 'success');
    } else {
        displayMessage(`Error: ${data.message}`, 'error');
    }

    if (btn) btn.disabled = false;
    return data;
}

// =================================================================
// 💡 ANALÍTICAS DEL DASHBOARD (Rutas v1)
// =================================================================

export async function fetchEquityCurveData() {
    const token = localStorage.getItem('token');
    if (!token) return [];

    try {
        const response = await fetch(`${BACKEND_URL}/api/v1/analytics/equity-curve`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error('Equity Curve Error:', error);
        return [];
    }
}

export async function fetchCycleKpis() {
    const token = localStorage.getItem('token');
    if (!token) return { averageProfitPercentage: 0, totalCycles: 0 };

    try {
        const response = await fetch(`${BACKEND_URL}/api/v1/analytics/kpis`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return { averageProfitPercentage: 0, totalCycles: 0 };
        
        const data = await response.json();
        return Array.isArray(data) ? (data[0] || data) : data;
    } catch (error) {
        console.error('KPIs Error:', error);
        return { averageProfitPercentage: 0, totalCycles: 0 };
    }
}