/**
 * dashboard.js - Controlador de Interfaz y Eventos (Versión Protegida)
 */
import { fetchEquityCurveData } from './apiService.js'; 
import { socket, currentBotState } from '../main.js'; 
import { updateBotUI } from './uiManager.js';
import * as Metrics from './metricsManager.js';

let balanceChart = null; 

const sounds = {
    buy: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'),
    sell: new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'),
};
Object.values(sounds).forEach(s => s.volume = 0.4);

export function initializeDashboardView(initialState) {
    console.log("📊 Dashboard: Sincronizando...");

    initBalanceChart();

    // Sincronización inicial inmediata
    const stateToUse = initialState || currentBotState;
    if (stateToUse) {
        updateBotUI(stateToUse);
        updateDistributionWidget(stateToUse);
    }

    setupSocketListeners();
    setupChartSelectors();
    setupTestButton(); 
    
    // Carga inicial de analítica protegida
    refreshAnalytics();

    updateHealthStatus('health-market-ws-text', socket?.connected);
}

async function refreshAnalytics() {
    try {
        const curveData = await fetchEquityCurveData();
        // Verificamos que sea un objeto válido antes de pasarlo
        if (curveData) {
            Metrics.setAnalyticsData(curveData);
        }
    } catch (e) { 
        console.error("❌ Error en Dashboard Metrics:", e.message); 
        // El error muere aquí y no detiene la aplicación
    }
}

function setupSocketListeners() {
    if (!socket) return;

    // EVITAMOS removeAllListeners que borran el flujo principal de main.js
    // En su lugar, usamos .off() solo para los que este módulo maneja específicamente
    socket.off('market-signal-update');
    socket.off('order-executed');
    socket.off('cycle-closed');
    socket.off('ai-decision-update');

    socket.on('market-signal-update', (analysis) => {
        const signalEl = document.getElementById('health-analyzer-signal');
        if (signalEl) {
            signalEl.textContent = `RSI: ${analysis.currentRSI.toFixed(1)} | ${analysis.action}`;
            signalEl.className = `text-[9px] font-bold ${analysis.action === 'BUY' ? 'text-emerald-400' : analysis.action === 'SELL' ? 'text-red-400' : 'text-blue-400'}`;
        }
    });

    socket.on('order-executed', (order) => {
        try {
            order.side.toLowerCase() === 'buy' ? sounds.buy.play() : sounds.sell.play();
            flashElement('auprice', order.side.toLowerCase() === 'buy' ? 'bg-emerald-500/20' : 'bg-orange-500/20');
        } catch (e) {}
    });
    
    // El listener de 'bot-state-update' ya vive en main.js, 
    // no necesitamos duplicarlo aquí a menos que Dashboard haga algo extra.
    // Si lo necesitas, asegúrate de NO borrar el de main.js.

    socket.on('cycle-closed', () => {
        sounds.sell.play();
        flashElement('auprofit', 'bg-yellow-500/30');
        refreshAnalytics(); 
    });

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