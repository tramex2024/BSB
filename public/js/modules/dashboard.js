/**
 * dashboard.js - Interface Controller (Shielded Version 2026)
 * Status: Audited - Carousel refactoring (Logic moved to carousel.js)
 */

import { fetchEquityCurveData, fetchRawTradeCycles, sendConfigToBackend } from './apiService.js';
import { currentBotState } from '../main.js'; 
import { socket } from './socket.js';
import { updateBotUI } from './uiManager.js';
import * as Metrics from './metricsManager.js';
import { renderEquityCurve, initializeChart } from './chart.js';
// Extracted module
import { checkAndHideGuide, startAutoCarousel } from './carousel.js';

// Global chart instances
let balanceChart = null; 
let lastRenderedData = null;
let lastRenderedAiData = null;
let carouselInterval; // We keep the variable here to avoid breaking external references

/**
 * Initializes the Dashboard view
 */
export function initializeDashboardView(initialState) {
    console.log("📊 Dashboard: Synchronizing system...");
    const stateToUse = initialState || currentBotState;

    // 1. CONFIGURE METRICS LISTENERS
    window.removeEventListener('metricsUpdated', handleMetricsUpdate);
    window.addEventListener('metricsUpdated', handleMetricsUpdate);

    // 2. INITIALIZE VISUAL COMPONENTS
    initBalanceChart();
    if (stateToUse?.symbol) {
        initializeChart('tv-chart-container', stateToUse.symbol);
    }

    // 3. INITIAL UI UPDATE AND CACHE RECOVERY
    if (stateToUse) {
        updateBotUI(stateToUse);
        updatePnLBar('long', stateToUse.lprofit || 0);
        updatePnLBar('short', stateToUse.sprofit || 0);
        updatePnLBar('ai', stateToUse.aiprofit || 0);
        
        checkAndHideGuide(stateToUse); 

        setTimeout(() => updateDistributionWidget(stateToUse), 150);

        // [MIGUARD] PERSISTENCE SHIELD
        if (stateToUse.aiLastPulse) {
            console.log("🧠 Memory Recovered: Painting AI pulse instantly...");
            requestAnimationFrame(() => renderAiPulseUI(stateToUse.aiLastPulse));
        }
    }

    // 4. CONFIGURE INTERACTIVITY AND CAROUSEL BUTTON
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
    
    // Guide configuration
    const ENABLE_STEP_GUIDE = true; 
    if (!ENABLE_STEP_GUIDE) {
        const carousel = document.querySelector('#step-carousel-body');
        if (carousel) carousel.classList.add('hidden');
    }
    
    // 5. LOAD HISTORICAL DATA
    refreshAnalytics();

    // Activate automatic carousel
    startAutoCarousel();
    
    const container = document.querySelector('.custom-scrollbar');
    if (container) {
        container.addEventListener('mouseenter', () => clearInterval(carouselInterval));
        container.addEventListener('mouseleave', startAutoCarousel);
    }
}

// --- KEEPING ALL ORIGINAL FUNCTIONS EXACTLY AS THEY ARE ---

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
                console.warn("KPIs not available yet:", err.message);
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
    console.group("📊 CALCULATION AUDIT: PROFIT/D");
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
    if (!aiData) return;

    // 1. We expand the filter to accept the new indicators
    const cleanData = {
        aiConfidence: Math.round(aiData.aiConfidence || 0),
        aiTrendLabel: aiData.aiTrendLabel || 'NEUTRAL',
        aiAdx: parseFloat(aiData.aiAdx || 0).toFixed(1),
        aiStochK: parseFloat(aiData.aiStochK || 0).toFixed(1), // New
        aiStochD: parseFloat(aiData.aiStochD || 0).toFixed(1), // New
        aiRsi: parseFloat(aiData.aiRsi || 0).toFixed(1),       // New
        aiMacd: parseFloat(aiData.aiMacd || 0).toFixed(4),     // New
        aiEngineMsg: aiData.aiEngineMsg || 'System Live'
    };

    if (lastRenderedAiData && JSON.stringify(lastRenderedAiData) === JSON.stringify(cleanData)) return;
    lastRenderedAiData = cleanData;

    // 2. Visual element updates
    const elements = {
        'ai-confidence-value': `${cleanData.aiConfidence}%`,
        'ai-trend-label': cleanData.aiTrendLabel,
        'ai-adx-val': cleanData.aiAdx,
        'ai-stoch-val': `${cleanData.aiStochK} / ${cleanData.aiStochD}`, // We show both
        'ai-rsi-val': cleanData.aiRsi,
        'ai-macd-val': cleanData.aiMacd,
        'ai-engine-msg': cleanData.aiEngineMsg
    };

    // We apply the values to the IDs (make sure they exist in your HTML)
    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = value;
    });

    // Confidence chart
    const dbCircle = document.getElementById('ai-confidence-circle');
    if (dbCircle) {
        const perimeter = 364.42;
        dbCircle.style.strokeDashoffset = perimeter - (cleanData.aiConfidence / 100) * perimeter;
    }

    // Progress bars (If you have the IDs, they will update)
    const adxBar = document.getElementById('ai-adx-bar');
    if (adxBar) adxBar.style.width = `${Math.min(cleanData.aiAdx, 100)}%`;
}