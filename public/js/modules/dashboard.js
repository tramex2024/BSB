/**
 * dashboard.js - Controlador de Interfaz y Eventos
 */
import { fetchEquityCurveData } from './apiService.js'; 
import { socket } from '../main.js'; 
import { updateBotUI } from './uiManager.js';
import * as Metrics from './metricsManager.js'; // Importamos la lógica de métricas

let balanceChart = null; 

const sounds = {
    buy: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'),
    sell: new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'),
};
Object.values(sounds).forEach(s => s.volume = 0.4);

export function initializeDashboardView(initialState) {
    console.log("📊 Dashboard: Sincronizando...");

    initBalanceChart();

    if (initialState) {
        updateBotUI(initialState);
        updateDistributionWidget(initialState);
    }

    setupSocketListeners();
    setupChartSelectors();
    setupTestButton(); 
    
    // Carga inicial de analítica
    refreshAnalytics();

    updateHealthStatus('health-market-ws-text', socket?.connected);
}

// --- GESTIÓN DE ANALÍTICA ---

async function refreshAnalytics() {
    try {
        const curveData = await fetchEquityCurveData();
        Metrics.setAnalyticsData(curveData);
    } catch (e) { console.error("Error cargando analítica:", e); }
}

function setupChartSelectors() {
    const paramSelector = document.getElementById('chart-param-selector');
    const botSelector = document.getElementById('chart-bot-selector');

    paramSelector?.addEventListener('change', (e) => Metrics.setChartParameter(e.target.value));
    botSelector?.addEventListener('change', (e) => Metrics.setBotFilter(e.target.value));
}

// --- SOCKETS Y EVENTOS ---

function setupSocketListeners() {
    if (!socket) return;

    // Limpieza selectiva para evitar duplicados
    socket.removeAllListeners('market-signal-update');
    socket.removeAllListeners('order-executed');
    socket.removeAllListeners('bot-state-update');
    socket.removeAllListeners('cycle-closed');

    socket.on('market-signal-update', (analysis) => {
        const signalEl = document.getElementById('health-analyzer-signal');
        if (signalEl) {
            signalEl.textContent = `RSI: ${analysis.currentRSI.toFixed(1)} | ${analysis.action}`;
            signalEl.className = `text-[9px] font-bold ${analysis.action === 'BUY' ? 'text-emerald-400' : analysis.action === 'SELL' ? 'text-red-400' : 'text-blue-400'}`;
        }
    });

    socket.on('order-executed', (order) => {
        order.side.toLowerCase() === 'buy' ? sounds.buy.play() : sounds.sell.play();
        flashElement('auprice', order.side.toLowerCase() === 'buy' ? 'bg-emerald-500/20' : 'bg-orange-500/20');
    });
    
    socket.on('bot-state-update', (fullState) => {
        updateBotUI(fullState);
        updateDistributionWidget(fullState); 
    });
 
    socket.on('cycle-closed', () => {
        sounds.sell.play();
        flashElement('auprofit', 'bg-yellow-500/30');
        refreshAnalytics(); // Recarga automática al cerrar ciclo
    });

    // Lógica IA
    socket.on('ai-decision-update', (data) => {
        const confidenceVal = Math.round(data.confidence * 100);
        updateElementText('ai-mini-confidence', `${confidenceVal}%`);
        updateElementText('ai-mini-thought', data.message);
    });
}

// --- UTILIDADES DE UI (Mantenidas del original) ---

function initBalanceChart() {
    const canvas = document.getElementById('balanceDonutChart');
    if (!canvas) return;
    if (balanceChart) balanceChart.destroy();
    balanceChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['USDT', 'BTC'],
            datasets: [{ data: [100, 0], backgroundColor: ['#10b981', '#f59e0b'], borderWidth: 0, cutout: '75%' }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function updateDistributionWidget(state) {
    if (!balanceChart) return;
    const usdt = parseFloat(state.balances?.USDT || 0);
    const btcAmount = parseFloat(state.balances?.BTC || 0);
    const price = parseFloat(state.marketPrice || 0);
    const btcInUsdt = btcAmount * price;
    const total = usdt + btcInUsdt;

    if (total > 0) {
        const usdtPct = (usdt / total) * 100;
        const btcPct = (btcInUsdt / total) * 100;
        balanceChart.data.datasets[0].data = [usdtPct, btcPct];
        balanceChart.update();
        document.getElementById('usdt-bar').style.width = `${usdtPct}%`;
        document.getElementById('btc-bar').style.width = `${btcPct}%`;
    }
}

function updateHealthStatus(textId, isOnline) {
    const txt = document.getElementById(textId);
    if (txt) {
        txt.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
        txt.className = `text-[9px] font-mono font-bold ${isOnline ? 'text-emerald-500' : 'text-red-400'}`;
    }
}

function flashElement(id, colorClass) {
    const container = document.getElementById(id)?.parentElement;
    if (container) {
        container.classList.add(colorClass);
        setTimeout(() => container.classList.remove(colorClass), 800);
    }
}

function updateElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setupTestButton() {
    const testBtn = document.getElementById('test-notification-btn');
    if (!testBtn) return;
    testBtn.onclick = () => flashElement('auprice', 'bg-emerald-500/40');
}