/**
 * dashboard.js - Controlador de Interfaz y Eventos (Versión Full Integrada 2026)
 */
import { fetchEquityCurveData, triggerPanicStop, toggleBotSideState } from './apiService.js'; 
import { socket, currentBotState } from '../main.js'; 
import { updateBotUI } from './uiManager.js';
import * as Metrics from './metricsManager.js';

// Instancias globales de gráficos
let balanceChart = null; 
let equityChart = null;

const sounds = {
    buy: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'),
    sell: new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'),
};
Object.values(sounds).forEach(s => s.volume = 0.4);

/**
 * Inicializa la vista del Dashboard
 */
export function initializeDashboardView(initialState) {
    console.log("📊 Dashboard: Sincronizando sistema...");

    const stateToUse = initialState || currentBotState;

    // 1. Inicializar Gráficos (Pasamos el estado para evitar el 100/0 inicial)
    initBalanceChart(stateToUse);
    initEquityChart();

    // 2. Sincronización inmediata con el estado global
    if (stateToUse) {
        updateBotUI(stateToUse);
        // Pequeño delay para asegurar que el canvas esté listo en el DOM
        setTimeout(() => {
            updateDistributionWidget(stateToUse);
        }, 100);
    }

    // 3. Configurar Eventos y Botones
    setupSocketListeners();
    setupActionButtons();
    setupAnalyticsFilters();
    
    // 4. Carga de analítica
    refreshAnalytics();

    // 5. Estado de conexión inicial
    updateHealthStatus('health-market-ws-text', socket?.connected);
    updateHealthStatus('health-user-ws-text', socket?.connected);
}

/**
 * CONFIGURACIÓN DE BOTONES
 */
function setupActionButtons() {
    const panicBtn = document.getElementById('panic-btn');
    if (panicBtn) {
        panicBtn.onclick = async () => {
            const confirmPanic = confirm("🚨 ¿ESTÁS SEGURO? Se detendrán todos los bots y se cancelarán órdenes.");
            if (confirmPanic) {
                await triggerPanicStop();
            }
        };
    }

    const btnConfigs = [
        { id: 'austartl-btn', side: 'long' },
        { id: 'austarts-btn', side: 'short' },
        { id: 'btn-start-ai', side: 'ai' }
    ];

    btnConfigs.forEach(btn => {
        const el = document.getElementById(btn.id);
        if (el) {
            el.onclick = async () => {
                const isRunning = el.textContent.includes("STOP");
                await toggleBotSideState(isRunning, btn.side);
            };
        }
    });
}

/**
 * Refresca analítica
 */
async function refreshAnalytics() {
    try {
        const curveData = await fetchEquityCurveData();
        if (curveData) {
            Metrics.setAnalyticsData(curveData);
            
            const bSel = document.getElementById('chart-bot-selector');
            const pSel = document.getElementById('chart-param-selector');

            const currentFilter = {
                bot: bSel?.value || 'all',
                param: pSel?.value || 'accumulatedProfit'
            };
            const filteredData = Metrics.getFilteredData(currentFilter);
            
            if (!equityChart) initEquityChart();
            updateEquityChart(filteredData);
        }
    } catch (e) { 
        console.error("❌ Error en Dashboard Metrics:", e.message); 
    }
}

/**
 * Listeners en tiempo real
 */
function setupSocketListeners() {
    if (!socket) return;

    const events = ['market-signal-update', 'order-executed', 'cycle-closed', 'ai-decision-update', 'ai-status-update'];
    events.forEach(ev => socket.off(ev));

    socket.on('market-signal-update', (analysis) => {
        const signalEl = document.getElementById('ai-trend-label');
        if (signalEl) {
            signalEl.textContent = analysis.trend || 'NEUTRAL';
            signalEl.className = `text-[8px] font-bold px-1.5 py-0.5 rounded bg-gray-900 ${
                analysis.trend === 'BULLISH' ? 'text-emerald-400' : analysis.trend === 'BEARISH' ? 'text-red-400' : 'text-gray-400'
            }`;
        }
    });

    socket.on('order-executed', (order) => {
        try {
            order.side.toLowerCase() === 'buy' ? sounds.buy.play() : sounds.sell.play();
            flashElement('auprice', order.side.toLowerCase() === 'buy' ? 'bg-emerald-500/20' : 'bg-orange-500/20');
        } catch (e) {}
    });

    socket.on('cycle-closed', () => {
        if(sounds.sell) sounds.sell.play();
        flashElement('auprofit', 'bg-yellow-500/30');
        refreshAnalytics(); 
    });

    socket.on('ai-decision-update', (data) => {
        const msgEl = document.getElementById('ai-engine-msg');
        if (msgEl) msgEl.textContent = data.message || "NEURAL CORE ANALYZING...";
        
        const confBar = document.getElementById('ai-confidence-fill');
        if (confBar) confBar.style.width = `${Math.round(data.confidence * 100)}%`;
    });

    socket.on('ai-status-update', (data) => {
        if (data.virtualBalance !== undefined) {
            currentBotState.virtualBalance = data.virtualBalance;
            updateDistributionWidget(currentBotState);
        }
    });
}

// --- GESTIÓN DE GRÁFICOS ---

function initBalanceChart(state) {
    const canvas = document.getElementById('balanceDonutChart');
    if (!canvas) return;
    if (balanceChart) balanceChart.destroy();

    // Extraer valores reales para el inicio
    const usdt = parseFloat(state?.lastAvailableUSDT || 0);
    const btcAmount = parseFloat(state?.lastAvailableBTC || 0);
    const price = parseFloat(state?.price || 0);
    const btcInUsdt = btcAmount * price;
    
    // Si no hay datos aún, usamos un placeholder visual tenue
    const initialData = (usdt + btcInUsdt === 0) ? [1, 0] : [usdt, btcInUsdt];
    
    balanceChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['USDT', 'BTC'],
            datasets: [{ 
                data: initialData, 
                backgroundColor: ['#10b981', '#fb923c'], 
                borderWidth: 0, 
                cutout: '75%'
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false } },
            animation: { duration: 800 }
        }
    });
}

function initEquityChart() {
    const canvas = document.getElementById('equityCurveChart');
    if (!canvas) return;
    if (equityChart) equityChart.destroy();

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');

    equityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#10b981',
                borderWidth: 2,
                fill: true,
                backgroundColor: gradient,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#64748b', font: { size: 9 } }
                }
            }
        }
    });
}

function updateDistributionWidget(state) {
    if (!balanceChart || !state) return;
    
    const usdt = parseFloat(state.lastAvailableUSDT || state.virtualBalance || 0);
    const btcAmount = parseFloat(state.lastAvailableBTC || 0);
    const price = parseFloat(state.price || state.marketPrice || 0);
    
    const btcInUsdt = btcAmount * price;
    const total = usdt + btcInUsdt;

    // Actualizar gráfico de dona
    if (total > 0) {
        balanceChart.data.datasets[0].data = [usdt, btcInUsdt];
        balanceChart.update();
    }
    
    // Actualizar barras de progreso y textos
    const displayUsdtPercent = total === 0 ? 0 : (usdt / total) * 100;
    const displayBtcPercent = total === 0 ? 0 : (btcInUsdt / total) * 100;

    const usdtBar = document.getElementById('usdt-bar');
    const btcBar = document.getElementById('btc-bar');
    if (usdtBar) usdtBar.style.width = `${displayUsdtPercent}%`;
    if (btcBar) btcBar.style.width = `${displayBtcPercent}%`;

    const uText = document.getElementById('aubalance-usdt');
    const bText = document.getElementById('aubalance-btc');
    if(uText) uText.innerText = usdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if(bText) bText.innerText = btcAmount.toFixed(6);
}

export function updateEquityChart(data) {
    if (!equityChart || !data || !data.points) return;
    equityChart.data.labels = data.points.map(p => p.time);
    equityChart.data.datasets[0].data = data.points.map(p => p.value);
    equityChart.update('none');
}

function setupAnalyticsFilters() {
    const bSel = document.getElementById('chart-bot-selector');
    const pSel = document.getElementById('chart-param-selector');

    const update = () => {
        const filtered = Metrics.getFilteredData({ bot: bSel.value, param: pSel.value });
        updateEquityChart(filtered);
    };

    if (bSel) bSel.onchange = update;
    if (pSel) pSel.onchange = update;
}

function updateHealthStatus(textId, isOnline) {
    const txt = document.getElementById(textId);
    if (txt) {
        txt.textContent = isOnline ? 'CONNECTED' : 'OFFLINE';
        txt.className = `font-mono font-bold ${isOnline ? 'text-emerald-500' : 'text-red-400'}`;
    }
}

function flashElement(id, colorClass) {
    const el = document.getElementById(id);
    const container = el ? el.closest('.bg-gray-700, .bg-gray-800') : null;
    if (container) {
        container.classList.add(colorClass);
        setTimeout(() => container.classList.remove(colorClass), 800);
    }
}