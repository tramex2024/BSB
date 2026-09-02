/**
 * dashboard.js - Interface Controller (Shielded & Audited Version 2026)
 * Status: Secured against lifecycle exceptions and partial payload overwrites.
 */

import { fetchEquityCurveData, fetchRawTradeCycles, sendConfigToBackend } from './apiService.js';
import { currentBotState } from '../main.js'; 
import { socket } from './socket.js';
import { updateBotUI } from './uiManager.js';
import * as Metrics from './metricsManager.js';
import { renderEquityCurve, initializeChart } from './chart.js';
import { checkAndHideGuide, startAutoCarousel } from './carousel.js';
import { BACKEND_URL } from '../main.js';

// Global chart instances
let balanceChart = null; 
let lastRenderedData = null;
let lastRenderedAiData = null;
let carouselInterval; 

/**
 * Initializes the Dashboard view
 */
export function initializeDashboardView(initialState) {
    console.log("📊 Dashboard: Synchronizing system...");
    const stateToUse = initialState || currentBotState;

    // 1. CONFIGURE METRICS LISTENERS
    window.removeEventListener('metricsUpdated', handleMetricsUpdate);
    window.addEventListener('metricsUpdated', handleMetricsUpdate);    

    if (!window._dashboardVisibilityInitialized) {
        window._dashboardVisibilityInitialized = true;
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log("👁️ [DASHBOARD] Tab visible again. Forcing UI refresh from memory...");
                Metrics.forceRefreshUI();
            }
        });
    }

    // 2. INITIALIZE VISUAL COMPONENTS
    try {
        initBalanceChart();
    } catch (chartError) {
        console.error("❌ [LIFECYCLE CRITICAL] Failed to initialize balance Donut Chart:", chartError);
    }

    if (stateToUse?.symbol) {
        try {
            initializeChart('tv-chart-container', stateToUse.symbol);
        } catch (tvError) {
            console.error("❌ Failed to initialize TradingView Chart container:", tvError);
        }
    }

    // 3. INITIAL UI UPDATE AND CACHE RECOVERY
    if (stateToUse) {
        try {
            updateBotUI(stateToUse);
            updatePnLBar('long', stateToUse.lprofit || 0);
            updatePnLBar('short', stateToUse.sprofit || 0);
            updatePnLBar('ai', stateToUse.aiprofit || 0);
            
            checkAndHideGuide(stateToUse); 

            setTimeout(() => {
                try {
                    updateDistributionWidget(stateToUse);
                } catch (e) { console.warn("Deferred widget distribution failed:", e); }
            }, 150);

            if (stateToUse.aiLastPulse) {
                console.log("🧠 Memory Recovered: Painting AI pulse instantly...");
                requestAnimationFrame(() => renderAiPulseUI(stateToUse.aiLastPulse));
            }
        } catch (uiError) {
            console.error("❌ Error painting core bot UI components:", uiError);
        }
    }

    // 4. CONFIGURE INTERACTIVITY AND CAROUSEL BUTTON
    setupActionButtons();
    setupAnalyticsFilters();

    const btnToggle = document.getElementById('btn-toggle-carousel');
    if (btnToggle) {
        btnToggle.onclick = () => {
            const body = document.getElementById('step-carousel-body');
            const chevron = document.getElementById('carousel-chevron');
            if (body && chevron) {
                body.classList.toggle('hidden');
                chevron.classList.toggle('rotate-180');
            }
        };
    }
    
    // 5. LOAD HISTORICAL DATA
    refreshAnalytics();
    Metrics.forceRefreshUI();

    startAutoCarousel();
    
    const container = document.querySelector('.custom-scrollbar');
    if (container) {
        container.addEventListener('mouseenter', () => clearInterval(carouselInterval));
        container.addEventListener('mouseleave', startAutoCarousel);
    }
}

async function refreshAnalytics() {
    try {
        addTerminalLog("ANALYTICS: FETCHING DATA...", 'info');
        
        const cyclesRes = await fetchRawTradeCycles(Metrics.getCurrentBotFilter?.() || 'all');

        if (cyclesRes && cyclesRes.length > 0) {
            Metrics.setAnalyticsData(cyclesRes);
            addTerminalLog(`ANALYTICS: ${cyclesRes.length} CYCLES LOADED`, 'success');
        }

    } catch (e) {
        console.error("Dashboard Analytics Sync Error:", e);
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

                const strategy = input.strategy;

                if (!currentBotState.config) currentBotState.config = {};
                if (!currentBotState.config[strategy]) currentBotState.config[strategy] = {};
                currentBotState.config[strategy].amountUsdt = newVal;

                const strategyConfigSnapshot = {
                    ...currentBotState.config[strategy],
                    amountUsdt: newVal
                };

                const configPayload = {
                    config: { 
                        ...currentBotState.config,
                        [strategy]: strategyConfigSnapshot
                    },
                    recalculate: true,
                    applyShield: true,
                    strategy: strategy
                };

                try {
                    const res = await sendConfigToBackend(configPayload);
                    if (res?.success && res.data) {
                        currentBotState.config = res.data;
                        if (typeof addTerminalLog === 'function') {
                            addTerminalLog(`${strategy.toUpperCase()}: AMOUNT MODIFIED. RECALCULATING GRID...`, 'success');
                        }
                    }
                } catch (error) {
                    console.error(`❌ Fallo crítico al sincronizar input de estrategia [${strategy}]:`, error);
                }
            };
        }
    });

    // ==========================================
    // STOP AT CYCLE CHECKBOXES SYNCHRONIZATION
    // ==========================================
    const stopCheckboxes = [
        { id: 'au-stop-long-at-cycle', strategy: 'long' },
        { id: 'au-stop-short-at-cycle', strategy: 'short' },
        { id: 'ai-stop-at-cycle', strategy: 'ai' }
    ];

    stopCheckboxes.forEach(item => {
        const checkbox = document.getElementById(item.id);
        if (checkbox) {
            const strategy = item.strategy;

            if (currentBotState?.config?.[strategy]) {
                checkbox.checked = !!currentBotState.config[strategy].stopAtCycle;
            }

            checkbox.onchange = async () => {
                const isChecked = checkbox.checked;

                if (!currentBotState.config) currentBotState.config = {};
                if (!currentBotState.config[strategy]) currentBotState.config[strategy] = {};
                currentBotState.config[strategy].stopAtCycle = isChecked;

                const strategyConfigSnapshot = {
                    ...currentBotState.config[strategy],
                    stopAtCycle: isChecked
                };

                const configPayload = {
                    config: { 
                        ...currentBotState.config,
                        [strategy]: strategyConfigSnapshot
                    },
                    recalculate: false,
                    applyShield: true,
                    strategy: strategy
                };

                try {
                    const res = await sendConfigToBackend(configPayload);
                    if (res?.success) {
                        if (typeof addTerminalLog === 'function') {
                            addTerminalLog(`${strategy.toUpperCase()}: STOP AT CYCLE -> ${isChecked ? 'ON' : 'OFF'}`, 'success');
                        }
                    } else {
                        checkbox.checked = !isChecked;
                        currentBotState.config[strategy].stopAtCycle = !isChecked;
                        if (typeof addTerminalLog === 'function') {
                            addTerminalLog(`${strategy.toUpperCase()}: CONFIG REJECTED BY BACKEND`, 'error');
                        }
                    }
                } catch (error) {
                    console.error(`❌ Critical sync failure for [${strategy}] stopAtCycle:`, error);
                    checkbox.checked = !isChecked;
                    currentBotState.config[strategy].stopAtCycle = !isChecked;
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
    
    if (typeof Chart === 'undefined') {
        console.warn("⚠️ Chart.js is not globally available.");
        return;
    }

    if (balanceChart) {
        balanceChart.destroy();
        balanceChart = null;
    }
    
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
    const maxPnLRange = 0.2; 
    const visualSize = Math.min((Math.abs(pnl) / maxPnLRange) * 50, 50);

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

    const usdt = parseFloat(state.lastAvailableUSDT ?? state.availableUsdt ?? state.usdtBalance ?? 0);
    const btcAmount = parseFloat(state.lastAvailableBTC ?? state.availableBtc ?? state.btcBalance ?? 0);
    const price = parseFloat(state.price ?? state.btcPrice ?? state.lastPrice ?? 0);

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

let persistentAiPulseCache = {
    aiConfidence: 0,
    aiTrendLabel: 'HOLD',
    aiAdx: '0.0',
    aiStochK: '0.0',
    aiStochD: '0.0',
    aiRsi: '0.0',
    aiMacd: '0.0000',
    aiEngineMsg: 'Waiting for market pulse...'
};

export function renderAiPulseUI(aiData) {
    if (aiData && typeof aiData === 'object') {
        const rawConfidence = aiData.aiConfidence !== undefined && aiData.aiConfidence !== null ? Math.round(aiData.aiConfidence) : NaN;
        const confidenceVal = !isNaN(rawConfidence) ? rawConfidence : persistentAiPulseCache.aiConfidence;

        const rawStochK = aiData.stochK ?? aiData.aiStochK;
        const stochKVal = rawStochK !== undefined && rawStochK !== null && !isNaN(parseFloat(rawStochK)) 
            ? parseFloat(rawStochK) 
            : parseFloat(persistentAiPulseCache.aiStochK);

        const rawStochD = aiData.stochD ?? aiData.aiStochD;
        const stochDVal = rawStochD !== undefined && rawStochD !== null && !isNaN(parseFloat(rawStochD)) 
            ? parseFloat(rawStochD) 
            : parseFloat(persistentAiPulseCache.aiStochD);

        const rawAdx = aiData.adx ?? aiData.aiAdx;
        const adxVal = rawAdx !== undefined && rawAdx !== null && !isNaN(parseFloat(rawAdx)) 
            ? parseFloat(rawAdx) 
            : parseFloat(persistentAiPulseCache.aiAdx);

        const rawRsi = aiData.rsi14 ?? aiData.currentRsi ?? aiData.aiRsi;
        const rsiVal = rawRsi !== undefined && rawRsi !== null && !isNaN(parseFloat(rawRsi)) 
            ? parseFloat(rawRsi) 
            : parseFloat(persistentAiPulseCache.aiRsi);

        const rawMacd = aiData.macdValue ?? aiData.aiMacd;
        const macdVal = rawMacd !== undefined && rawMacd !== null && !isNaN(parseFloat(rawMacd)) 
            ? parseFloat(rawMacd) 
            : parseFloat(persistentAiPulseCache.aiMacd);

        const trendLabel = aiData.aiTrendLabel || aiData.signal || persistentAiPulseCache.aiTrendLabel;
        const engineMsg = aiData.aiEngineMsg || aiData.reason || persistentAiPulseCache.aiEngineMsg;

        const hasChanged = 
            confidenceVal !== persistentAiPulseCache.aiConfidence ||
            trendLabel !== persistentAiPulseCache.aiTrendLabel ||
            adxVal.toFixed(1) !== persistentAiPulseCache.aiAdx ||
            stochKVal.toFixed(1) !== persistentAiPulseCache.aiStochK ||
            stochDVal.toFixed(1) !== persistentAiPulseCache.aiStochD ||
            rsiVal.toFixed(1) !== persistentAiPulseCache.aiRsi ||
            macdVal.toFixed(4) !== persistentAiPulseCache.aiMacd;

        persistentAiPulseCache = {
            aiConfidence: confidenceVal,
            aiTrendLabel: trendLabel,
            aiAdx: adxVal.toFixed(1),
            aiStochK: stochKVal.toFixed(1),
            aiStochD: stochDVal.toFixed(1),
            aiRsi: rsiVal.toFixed(1),
            aiMacd: macdVal.toFixed(4),
            aiEngineMsg: engineMsg
        };

        if (!hasChanged) return;
    }

    const cleanData = persistentAiPulseCache;

    const elements = {
        'ai-confidence-value': `${cleanData.aiConfidence}%`,
        'ai-trend-label': cleanData.aiTrendLabel,
        'ai-adx-val': cleanData.aiAdx,
        'ai-stoch-val': `${cleanData.aiStochK} / ${cleanData.aiStochD}`,
        'ai-rsi-val': cleanData.aiRsi,
        'ai-macd-val': cleanData.aiMacd,
        'ai-engine-msg': cleanData.aiEngineMsg
    };

    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el && el.innerText !== value) {
            el.innerText = value;
        }
    });

    const dbCircle = document.getElementById('ai-confidence-circle');
    if (dbCircle) {
        const perimeter = 364.42;
        const targetOffset = perimeter - (Math.min(Math.max(cleanData.aiConfidence, 0), 100) / 100) * perimeter;
        const currentOffset = parseFloat(dbCircle.style.strokeDashoffset) || 0;

        if (Math.abs(currentOffset - targetOffset) > 0.1) {
            dbCircle.style.transition = 'none';
            dbCircle.style.strokeDashoffset = targetOffset;
            setTimeout(() => {
                if (dbCircle) dbCircle.style.transition = 'stroke-dashoffset 1s ease-out';
            }, 50);
        }
    }

    const adxBar = document.getElementById('ai-adx-bar');
    if (adxBar) adxBar.style.width = `${Math.min(parseFloat(cleanData.aiAdx), 100)}%`;

    const stochBar = document.getElementById('ai-stoch-bar');
    if (stochBar) {
        const stochPercentage = Math.min(100, Math.max(0, parseFloat(cleanData.aiStochK)));
        stochBar.style.width = `${stochPercentage}%`;
    }
}