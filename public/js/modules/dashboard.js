/**
 * dashboard.js - Controlador de Interfaz (Versión Blindada 2026)
 * Estado: Auditado - Refactorización de Carrusel (Lógica movida a carousel.js)
 */

import { fetchEquityCurveData, fetchRawTradeCycles, sendConfigToBackend } from './apiService.js';
import { currentBotState } from '../main.js'; 
import { socket } from './socket.js';
import { updateBotUI } from './uiManager.js';
import * as Metrics from './metricsManager.js';
import { renderEquityCurve, initializeChart } from './chart.js';
// Módulo extraído
import { checkAndHideGuide, startAutoCarousel } from './carousel.js';

// Instancias globales de gráficos
let balanceChart = null; 
let lastRenderedData = null;
let lastRenderedAiData = null;
let carouselInterval; // Mantenemos la variable aquí para no romper referencias externas si las hubiera

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

    // 3. ACTUALIZACIÓN DE UI INICIAL Y RECUPERACIÓN DE CACHÉ
    if (stateToUse) {
        updateBotUI(stateToUse);
        updatePnLBar('long', stateToUse.lprofit || 0);
        updatePnLBar('short', stateToUse.sprofit || 0);
        updatePnLBar('ai', stateToUse.aiprofit || 0);
        
        checkAndHideGuide(stateToUse); 

        setTimeout(() => updateDistributionWidget(stateToUse), 150);

        // [MIGUARD] BLINDAJE DE PERSISTENCIA
        if (stateToUse.aiLastPulse) {
            console.log("🧠 Memoria Recuperada: Pintando pulso de IA instantáneamente...");
            requestAnimationFrame(() => renderAiPulseUI(stateToUse.aiLastPulse));
        }
    }

    // 4. CONFIGURAR INTERACTIVIDAD Y BOTÓN DEL CARRUSEL
    setupActionButtons();
    setupAnalyticsFilters();

    const btnToggle = document.getElementById('btn-toggle-carousel');
    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            const body = document.getElementById('step-carousel-body');
            const chevron = document.getElementById('carousel-chevron');
            if (body && chevron) {
                body.classList.toggle('hidden');
                chevron.classList.toggle('rotate-180');
            }
        });
    }
    
    // Configuración de la guía
    const ENABLE_STEP_GUIDE = true; 
    if (!ENABLE_STEP_GUIDE) {
        const carousel = document.querySelector('#step-carousel-body');
        if (carousel) carousel.classList.add('hidden');
    }
    
    // 5. CARGA DE DATOS HISTÓRICOS
    refreshAnalytics();

    // Activar carrusel automático
    startAutoCarousel();
    
    const container = document.querySelector('.custom-scrollbar');
    if (container) {
        container.addEventListener('mouseenter', () => clearInterval(carouselInterval));
        container.addEventListener('mouseleave', startAutoCarousel);
    }
}

// --- MANTENEMOS TODAS LAS FUNCIONES ORIGINALES EXACTAS ---

async function refreshAnalytics() {
    try {
        addTerminalLog("ANALYTICS: FETCHING DATA...", 'info');
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
                return null;
            })
        ]);

        if (curveRes?.success) requestAnimationFrame(() => renderEquityCurve(curveRes.data));
        if (cyclesRes && cyclesRes.length > 0) {
            Metrics.setAnalyticsData(cyclesRes);
            addTerminalLog(`ANALYTICS: ${cyclesRes.length} CYCLES LOADED`, 'success');
        }
        if (kpiRes && kpiRes.success) updateQuickStats(kpiRes.data || kpiRes);
    } catch (e) {
        console.error("Dashboard Error:", e);
        addTerminalLog("ERROR SYNCING ANALYTICS", 'error');
    }
}

function handleMetricsUpdate(e) {
    if (e.detail && e.detail.points) requestAnimationFrame(() => renderEquityCurve(e.detail.points));
}

function setupActionButtons() {
    const quickInputs = [
        { id: 'auamountl-usdt', strategy: 'long' },
        { id: 'auamounts-usdt', strategy: 'short' },
        { id: 'auamountai-usdt', strategy: 'ai' }
    ];

    quickInputs.forEach(input => {
        const el = document.getElementById(input.id);
        if (el) {
            if (currentBotState?.config?.[input.strategy]) {
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
                if (res?.success) addTerminalLog(`${input.strategy.toUpperCase()}: AMOUNT UPDATED TO $${newVal}`, 'success');
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
    const sensitivity = 0.5; 
    const visualSize = Math.min(Math.abs(pnl) * (50 / sensitivity), 50);
    if (pnl >= 0) {
        bar.style.left = '50%'; 
        bar.style.width = `${visualSize}%`;
        bar.className = 'absolute h-full transition-all duration-500 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]';
    } else {
        bar.style.left = `${50 - visualSize}%`; 
        bar.style.width = `${visualSize}%`;
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

function updateQuickStats(kpiData) {
    console.group("📊 AUDITORÍA DE CÁLCULOS: PROFIT/D");
    const totalProfit = parseFloat(kpiData.totalNetProfit) || 0;
    const totalCycles = parseInt(kpiData.totalCycles) || 0;
    const avgHours = parseFloat(kpiData.avgDurationHours) || 0;
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

export function renderAiPulseUI(aiData) {

    console.log("DEBUG PULSE: Recibido ->", aiData);

    if (!aiData) return;
    const cleanData = {
        aiConfidence: Math.round(aiData.aiConfidence || 0),
        aiTrendLabel: aiData.aiTrendLabel || 'NEUTRAL',
        aiAdx: parseFloat(aiData.aiAdx || 0).toFixed(1),
        aiStoch: parseFloat(aiData.aiStoch || 0).toFixed(1),
        aiEngineMsg: aiData.aiEngineMsg || 'System Live'
    };
    if (lastRenderedAiData && JSON.stringify(lastRenderedAiData) === JSON.stringify(cleanData)) return;
    lastRenderedAiData = cleanData;
    const dbCircle = document.getElementById('ai-confidence-circle');
    if (dbCircle) {
        const perimeter = 364.42;
        const offset = perimeter - (cleanData.aiConfidence / 100) * perimeter;
        dbCircle.style.strokeDashoffset = offset;
    }
    const confVal = document.getElementById('ai-confidence-value');
    const trendLabel = document.getElementById('ai-trend-label');
    const adxVal = document.getElementById('ai-adx-val');
    const stochVal = document.getElementById('ai-stoch-val');
    const adxBar = document.getElementById('ai-adx-bar');
    const stochBar = document.getElementById('ai-stoch-bar');
    const engineMsg = document.getElementById('ai-engine-msg');
    if (confVal) confVal.innerText = `${cleanData.aiConfidence}%`;
    if (trendLabel) trendLabel.innerText = cleanData.aiTrendLabel;
    if (adxVal) adxVal.innerText = cleanData.aiAdx;
    if (stochVal) stochVal.innerText = cleanData.aiStoch;
    if (adxBar) adxBar.style.width = `${Math.min(cleanData.aiAdx, 100)}%`;
    if (stochBar) stochBar.style.width = `${Math.min(cleanData.aiStoch, 100)}%`;
    if (engineMsg) engineMsg.innerText = cleanData.aiEngineMsg;
}