/**
 * dashboard.js - Controlador de Interfaz (Versión Blindada 2026)
 * Estado: Limpio - Delegación de controles a botControls.js
 */

import { fetchEquityCurveData, fetchRawTradeCycles, sendConfigToBackend } from './apiService.js';
import { currentBotState } from '../main.js'; 
import { socket } from './socket.js';
import { updateBotUI } from './uiManager.js';
import * as Metrics from './metricsManager.js';
import { renderEquityCurve, initializeChart } from './chart.js';

// Instancias globales de gráficos
let balanceChart = null; 

/**
 * Inicializa la vista del Dashboard
 */
export function initializeDashboardView(initialState) {
    console.log("📊 Dashboard: Synchronizing system...");
    const stateToUse = initialState || currentBotState;

    // 1. CONFIGURAR ESCUCHADORES DE MÉTRICAS
    window.removeEventListener('metricsUpdated', handleMetricsUpdate);
    window.addEventListener('metricsUpdated', handleMetricsUpdate);

    // 2. INICIALIZAR COMPONENTES VISUALES
    initBalanceChart();
    if (stateToUse?.symbol) {
        initializeChart('tv-chart-container', stateToUse.symbol);
    }

    // 3. ACTUALIZACIÓN DE UI INICIAL
    if (stateToUse) {
        updateBotUI(stateToUse);
        updatePnLBar('long', stateToUse.lprofit || 0);
        updatePnLBar('short', stateToUse.sprofit || 0);
        updatePnLBar('ai', stateToUse.aiprofit || 0);
        updateAIMarketPulse(stateToUse); // <-- AGREGADO: Carga inicial del pulso de IA
        setTimeout(() => updateDistributionWidget(stateToUse), 150);
    }

    // 4. CONFIGURAR INTERACTIVIDAD (Solo analítica e inputs)
    setupActionButtons();
    setupAnalyticsFilters();
    
    // 5. CARGA DE DATOS HISTÓRICOS
    refreshAnalytics();
}

/**
 * dashboard.js - refreshAnalytics (Versión Robusta)
 */
async function refreshAnalytics() {
    try {
        addTerminalLog("ANALYTICS: FETCHING DATA...", 'info');

        // Usamos rutas relativas para que funcione tanto en local como en Vercel
        const [curveRes, cyclesRes, kpiRes] = await Promise.all([
            fetchEquityCurveData(Metrics.getCurrentBotFilter?.() || 'all'),
            fetchRawTradeCycles(Metrics.getCurrentBotFilter?.() || 'all'),
            fetch('/api/v1/analytics/kpis', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            }).then(res => {
                if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
                return res.json();
            }).catch(err => {
                console.warn("KPIs no disponibles aún:", err.message);
                return null; // Retornamos null para no romper el Promise.all
            })
        ]);

        // 1. Renderizar Gráfico
        if (curveRes?.success) {
            requestAnimationFrame(() => renderEquityCurve(curveRes.data));
        }

        // 2. Sincronizar Ciclos (¡Los 29 detectados!)
        if (cyclesRes && cyclesRes.length > 0) {
            Metrics.setAnalyticsData(cyclesRes);
            addTerminalLog(`ANALYTICS: ${cyclesRes.length} CYCLES LOADED`, 'success');
        }

        // 3. Actualizar Profit/H y KPIs
        if (kpiRes && kpiRes.success) {
            updateQuickStats(kpiRes.data);
        }

    } catch (e) {
        console.error("Dashboard Error:", e);
        addTerminalLog("ERROR SYNCING ANALYTICS", 'error');
    }
}

/**
 * handleMetricsUpdate
 * Escucha el evento del MetricsManager para redibujar el gráfico
 * cuando el usuario cambia filtros (AI/Long/Short).
 */
function handleMetricsUpdate(e) {
    if (e.detail && e.detail.points) {
        requestAnimationFrame(() => renderEquityCurve(e.detail.points));
    }
}

/**
 * Configuración de botones y inputs (Solo lógica que no está en botControls)
 */
function setupActionButtons() {
    const quickInputs = [
        { id: 'auamountl-usdt', strategy: 'long' },
        { id: 'auamounts-usdt', strategy: 'short' },
        { id: 'auamountai-usdt', strategy: 'ai' }
    ];

    quickInputs.forEach(input => {
        const el = document.getElementById(input.id);
        if (el) {
            if (currentBotState.config && currentBotState.config[input.strategy]) {
                el.value = currentBotState.config[input.strategy].amountUsdt || "";
            }

            el.onchange = async () => {
                const newVal = parseFloat(el.value);
                if (isNaN(newVal) || newVal < 0) return;

                const configPayload = {
                    config: { [input.strategy]: { amountUsdt: newVal } },
                    applyShield: true,
                    strategy: input.strategy
                };

                const res = await sendConfigToBackend(configPayload);
                if (res?.success) {
                    addTerminalLog(`${input.strategy.toUpperCase()}: AMOUNT UPDATED TO $${newVal}`, 'success');
                }
            };
        }
    });
}

function setupAnalyticsFilters() {
    const bSel = document.getElementById('chart-bot-selector');
    const pSel = document.getElementById('chart-param-selector');
    if (bSel) bSel.onchange = () => Metrics.setBotFilter(bSel.value);
    if (pSel) pSel.onchange = () => Metrics.setChartParameter(pSel.value);
}

// --- TERMINAL Y GRÁFICOS ---

export function addTerminalLog(msg, type = 'info') {
    const logContainer = document.getElementById('dashboard-logs');
    if (!logContainer) return;
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const colors = { info: 'text-gray-400 border-gray-700', success: 'text-emerald-400 border-emerald-500/50', warning: 'text-yellow-400 border-yellow-500/50', error: 'text-red-400 border-red-500/50' };
    const logEntry = document.createElement('div');
    logEntry.className = `flex gap-2 py-1 px-2 border-l-2 bg-white/5 mb-1 text-[10px] font-mono rounded-r animate-fadeIn ${colors[type] || colors.info}`;
    logEntry.innerHTML = `<span class="opacity-30 font-bold">[${timestamp}]</span><span class="flex-grow tracking-tighter uppercase">${msg}</span>`;
    logContainer.prepend(logEntry);
    if (logContainer.childNodes.length > 40) logContainer.lastChild.remove();
}

function initBalanceChart() {
    const canvas = document.getElementById('balanceDonutChart');
    if (!canvas) return;
    if (balanceChart) balanceChart.destroy();
    balanceChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['USDT', 'BTC'], datasets: [{ data: [100, 0], backgroundColor: ['#10b981', '#fb923c'], borderWidth: 0, cutout: '75%' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

export function updatePnLBar(id, pnlValue) {
    const bar = document.getElementById(`pnl-bar-${id}`);
    if (!bar) return;
    const pnl = parseFloat(pnlValue) || 0;
    const visualSize = Math.min(Math.abs(pnl) / 1 * 50, 50);
    if (pnl >= 0) {
        bar.style.left = '50%'; bar.style.width = `${visualSize}%`;
        bar.className = 'absolute h-full transition-all duration-500 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]';
    } else {
        bar.style.left = `${50 - visualSize}%`; bar.style.width = `${visualSize}%`;
        bar.className = 'absolute h-full transition-all duration-500 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';
    }
}

export function updateDistributionWidget(state) {
    if (!balanceChart || !state) return;
    const usdt = parseFloat(state.lastAvailableUSDT || 0);
    const btcAmount = parseFloat(state.lastAvailableBTC || 0);
    const price = parseFloat(state.price || 0);
    if (price > 0) {
        const btcInUsdt = btcAmount * price;
        const total = usdt + btcInUsdt;
        if (total > 0) {
            balanceChart.data.datasets[0].data = [usdt, btcInUsdt];
            balanceChart.update('none');
            const uBar = document.getElementById('usdt-bar');
            const bBar = document.getElementById('btc-bar');
            if (uBar) uBar.style.width = `${(usdt / total) * 100}%`;
            if (bBar) bBar.style.width = `${(btcInUsdt / total) * 100}%`;
        }
    }
}

/**
 * AGREGADO: Renderizador dinámico del Widget AI Market Pulse (Edición Dashboard Aislada)
 * Controla barras de progreso, etiquetas y animación del SVG de confianza de la pestaña principal.
 */
export function updateAIMarketPulse(state) {
    if (!state) return;

    // 1. Extraer variables desde el payload del estado (con valores de respaldo)
    const adx = parseFloat(state.aiAdx) || 0;
    const stoch = parseFloat(state.aiStoch) || 0;
    const confidence = Math.min(Math.max(parseInt(state.aiConfidence) || 0, 0), 100);
    const trendLabel = state.aiTrendLabel || 'NEUTRAL';
    const engineMsg = state.aiEngineMsg || 'System Operational';

    // 2. Actualizar etiquetas de texto usando los nuevos IDs con prefijo db-
    const trendEl = document.getElementById('db-ai-trend-label');
    const msgEl = document.getElementById('db-ai-engine-msg');
    const adxValEl = document.getElementById('db-ai-adx-val');
    const stochValEl = document.getElementById('db-ai-stoch-val');
    const confValEl = document.getElementById('db-ai-confidence-value');

    if (trendEl) trendEl.innerText = trendLabel;
    if (msgEl) msgEl.innerText = engineMsg;
    if (adxValEl) adxValEl.innerText = adx.toFixed(1);
    if (stochValEl) stochValEl.innerText = stoch.toFixed(1);
    if (confValEl) confValEl.innerText = `${confidence}%`;

    // 3. Sincronizar las micro-barras horizontales del dashboard
    const adxBar = document.getElementById('db-ai-adx-bar');
    const stochBar = document.getElementById('db-ai-stoch-bar');
    if (adxBar) adxBar.style.width = `${Math.min(adx, 100)}%`;
    if (stochBar) stochBar.style.width = `${Math.min(stoch, 100)}%`;

    // 4. ANIMACIÓN TRIGGER DEL CÍRCULO SVG EXCLUSIVO DEL DASHBOARD
    const confidenceCircle = document.getElementById('db-ai-confidence-circle');
    if (confidenceCircle) {
        const perimeter = 364.42;
        const offset = perimeter - (confidence / 100) * perimeter;
        requestAnimationFrame(() => {
            confidenceCircle.style.strokeDashoffset = offset;
        });
    }
}

/**
 * dashboard.js - Auditoría de KPIs (Profit/D)
 */
function updateQuickStats(response) {
    console.group("📊 AUDITORÍA DE CÁLCULOS: PROFIT/D");
    const kpis = response.data || response;
    
    const totalProfit = parseFloat(kpis.totalNetProfit) || 0;
    const totalCycles = parseInt(kpis.totalCycles) || 0;
    const avgHours = parseFloat(kpis.avgDurationHours) || 0;
    const totalTimeHours = avgHours * totalCycles;

    let profitPerDay = 0;
    if (totalTimeHours > 0) {
        const profitPerHour = totalProfit / totalTimeHours;
        profitPerDay = profitPerHour * 24;
    }

    const profitElement = document.getElementById('cycle-efficiency');
    if (profitElement) {
        const finalValue = `$${profitPerDay.toFixed(4)}/d`;
        profitElement.innerText = finalValue;
        profitElement.style.color = profitPerDay >= 0 ? '#34d399' : '#ef4444';
    }
    console.groupEnd();
}