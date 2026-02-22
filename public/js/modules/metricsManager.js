/**
 * metricsManager.js - Motor de Análisis de Rentabilidad (TradeCycles Only)
 * Versión Final Blindada - Corrección de Duplicados y Renderizado
 */

let cycleHistoryData = [];
let currentChartParameter = 'accumulatedProfit';
let currentBotFilter = 'all';

/**
 * Normaliza y almacena datos de TradeCycles
 * Limpia la memoria antes de cargar para evitar duplicados.
 */
// public/js/modules/apiService.js

/**
 * apiService.js - Comunicaciones REST Sincronizadas (2026)
 * Versión: Recuperación de Estabilidad + Corrección de Cruce de Variables
 */
import { displayMessage } from './uiManager.js';
import { BACKEND_URL, logStatus, currentBotState } from '../main.js';

export let isSavingConfig = false;

const MINIMOS = {
    amount: 6.0,
    purchase: 6.0,
    variation: 0.1,
    profit: 0.1,
    step: 0
};

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

        const result = await response.json().catch(() => ({ 
            success: response.ok, 
            message: response.statusText 
        }));

        return result; 
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
 * RECOLECTA CONFIGURACIÓN
 * Corregido el mapeo de Price_Var y Size_Var para coincidir con el HTML
 */
export function getBotConfiguration() {
    const getNum = (id, path, minVal = 0) => {
        const el = document.getElementById(id);
        
        // Si no existe el input (cambio de pestaña), rescatar del estado global
        if (!el) {
            const parts = path.split('.');
            const val = parts.reduce((obj, key) => obj?.[key], currentBotState.config);
            return val ?? minVal;
        }
        
        let rawValue = el.value.trim();
        if (rawValue === "") {
            const parts = path.split('.');
            const val = parts.reduce((obj, key) => obj?.[key], currentBotState.config);
            return val ?? minVal;
        }

        const val = parseFloat(rawValue.replace(/[^0-9.-]+/g,""));
        return isNaN(val) ? minVal : val;
    };

    const getCheck = (id, path) => {
        const el = document.getElementById(id);
        if (!el) {
            const parts = path.split('.');
            return parts.reduce((obj, key) => obj?.[key], currentBotState.config) ?? false;
        }
        return el.checked;
    };

    // MAPEO CRÍTICO: 
    // HTML 'auincrement' (Multiplier) -> size_var
    // HTML 'audecrement' (Drop/Rise) -> price_var
    return {
        symbol: "BTC_USDT",
        long: {
            amountUsdt:      getNum('auamountl-usdt', 'long.amountUsdt', MINIMOS.amount),
            purchaseUsdt:    getNum('aupurchasel-usdt', 'long.purchaseUsdt', MINIMOS.purchase),
            price_var:       getNum('audecrementl', 'long.price_var', MINIMOS.variation), 
            size_var:        getNum('auincrementl', 'long.size_var', 1),
            profit_percent:  getNum('autriggerl', 'long.profit_percent', MINIMOS.profit),
            price_step_inc:  getNum('aupricestep-l', 'long.price_step_inc', MINIMOS.step),
            stopAtCycle:     getCheck('au-stop-long-at-cycle', 'long.stopAtCycle'),
            enabled:         currentBotState.lstate !== 'STOPPED'
        },
        short: {
            amountUsdt:      getNum('auamounts-usdt', 'short.amountUsdt', MINIMOS.amount),
            purchaseUsdt:    getNum('aupurchases-usdt', 'short.purchaseUsdt', MINIMOS.purchase),
            price_var:       getNum('audecrements', 'short.price_var', MINIMOS.variation),
            size_var:        getNum('auincrements', 'short.size_var', 1),
            profit_percent:  getNum('autriggers', 'short.profit_percent', MINIMOS.profit),
            price_step_inc:  getNum('aupricestep-s', 'short.price_step_inc', MINIMOS.step),
            stopAtCycle:     getCheck('au-stop-short-at-cycle', 'short.stopAtCycle'),
            enabled:         currentBotState.sstate !== 'STOPPED' 
        },
        ai: {
    // Intentamos capturar desde el ID del Dashboard o el ID de la pestaña AI
    amountUsdt: getNum('auamountai-usdt', 'ai.amountUsdt', 100) || 
                getNum('ai-amount-usdt', 'ai.amountUsdt', 100),
                
    stopAtCycle: getCheck('au-stop-ai-at-cycle', 'ai.stopAtCycle') || 
                 getCheck('ai-stop-at-cycle', 'ai.stopAtCycle'),
                 
    enabled: currentBotState.config?.ai?.enabled || false
}
    };
}

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
        // Reducimos el tiempo de bloqueo para que la UI sea más responsiva
        setTimeout(() => { isSavingConfig = false; }, 500);
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

export function setChartParameter(param) {
    currentChartParameter = param;
    updateMetricsDisplay();
}

export function setBotFilter(filter) {
    console.log(`🎯 Filtrando Dashboard por: ${filter}`);
    currentBotFilter = filter.toLowerCase();
    updateMetricsDisplay();
}

/**
 * Calcula KPIs y emite evento para el Dashboard
 */
function updateMetricsDisplay() {
    // FILTRADO DINÁMICO SOBRE DATOS LIMPIOS
    const filtered = cycleHistoryData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter;
    });

    const totalCycles = filtered.length;

    if (totalCycles === 0) {
        return resetKPIs();
    }

    let totalProfitPct = 0;
    let totalNetProfitUsdt = 0;
    let winningCycles = 0;
    let totalTimeMs = 0;

    filtered.forEach(cycle => {
        totalProfitPct += cycle.profitPercentage;
        totalNetProfitUsdt += cycle.netProfit;
        if (cycle.netProfit > 0) winningCycles++;

        // Cálculo de duración para Profit/Hour (Soporta formatos mixtos de fecha)
        let startRaw = cycle.startTime;
        const start = startRaw?.$date ? new Date(startRaw.$date) : new Date(startRaw);
        const end = cycle.processedDate;

        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const diff = end.getTime() - start.getTime();
            if (diff > 0) totalTimeMs += diff;
        }
    });

    // Cálculos de KPIs Finales
    const avgProfit = totalProfitPct / totalCycles;
    const winRate = (winningCycles / totalCycles) * 100;
    const totalHours = totalTimeMs / (1000 * 60 * 60);
    const profitPerHour = totalHours > 0.1 ? (totalNetProfitUsdt / totalHours) : 0;

    // ACTUALIZACIÓN DE UI
    renderText('total-cycles-closed', totalCycles);
    renderText('cycle-avg-profit', `${avgProfit >= 0 ? '+' : ''}${avgProfit.toFixed(2)}%`, `text-sm font-bold ${avgProfit >= 0 ? 'text-emerald-400' : 'text-red-500'}`);
    renderText('cycle-win-rate', `${winRate.toFixed(1)}%`, `text-sm font-bold ${winRate >= 50 ? 'text-emerald-400' : 'text-orange-400'}`);
    renderText('cycle-efficiency', `$${profitPerHour.toFixed(2)}/h`, `text-sm font-bold ${profitPerHour >= 0 ? 'text-indigo-400' : 'text-red-400'}`);

    // ENVÍO DE DATOS AL GRÁFICO (Trigger de renderizado)
    try {
        const chartData = getFilteredData();
        window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: chartData }));
    } catch (e) {
        console.error("❌ Metrics Error:", e);
    }
}

/**
 * Genera los puntos para el gráfico basándose en el filtro actual
 */
export function getFilteredData() {
    const filtered = cycleHistoryData.filter(c => {
        if (currentBotFilter === 'all') return true;
        return c.strategy === currentBotFilter;
    });

    let accumulated = 0;
    const points = [];

    // Punto de partida en 0 para estética de la gráfica
    points.push({ time: 'Start', value: 0 });

    filtered.forEach(cycle => {
        accumulated += cycle.netProfit;
        const date = cycle.processedDate;
        const timeLabel = `${date.getDate()}/${date.getMonth()+1} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;

        points.push({
            time: timeLabel,
            value: currentChartParameter === 'accumulatedProfit' ? parseFloat(accumulated.toFixed(4)) : cycle.profitPercentage
        });
    });

    return { points };
}

function resetKPIs() {
    renderText('total-cycles-closed', '0');
    renderText('cycle-avg-profit', '0.00%', 'text-sm font-bold text-gray-500');
    renderText('cycle-win-rate', '0%', 'text-sm font-bold text-gray-500');
    renderText('cycle-efficiency', '$0.00/h', 'text-sm font-bold text-gray-500');
    window.dispatchEvent(new CustomEvent('metricsUpdated', { detail: { points: [] } }));
}

function renderText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}