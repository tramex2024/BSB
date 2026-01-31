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
    // ✅ CORRECCIÓN: Se agrega la función faltante al final del archivo para evitar el ReferenceError
    setupChartSelectors(); 
    setupTestButton(); 
    
    // Carga inicial de analítica protegida
    refreshAnalytics();

    updateHealthStatus('health-market-ws-text', socket?.connected);
}

async function refreshAnalytics() {
    try {
        const curveData = await fetchEquityCurveData();
        if (curveData) {
            Metrics.setAnalyticsData(curveData);
        }
    } catch (e) { 
        console.error("❌ Error en Dashboard Metrics:", e.message); 
    }
}

function setupSocketListeners() {
    if (!socket) return;

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

// --- UTILIDADES DE UI ---

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

/**
 * ✅ CORRECCIÓN: Sincronizado con la Estructura Plana 2026
 */
function updateDistributionWidget(state) {
    if (!balanceChart) return;
    
    // Usamos los campos que limpiamos en la DB
    const usdt = parseFloat(state.lastAvailableUSDT || 0);
    const btcAmount = parseFloat(state.lastAvailableBTC || 0);
    const price = parseFloat(state.price || 0); // main.js envía .price
    
    const btcInUsdt = btcAmount * price;
    const total = usdt + btcInUsdt;

    if (total > 0) {
        const usdtPct = (usdt / total) * 100;
        const btcPct = (btcInUsdt / total) * 100;
        balanceChart.data.datasets[0].data = [usdtPct, btcPct];
        balanceChart.update();
        
        const usdtBar = document.getElementById('usdt-bar');
        const btcBar = document.getElementById('btc-bar');
        if (usdtBar) usdtBar.style.width = `${usdtPct}%`;
        if (btcBar) btcBar.style.width = `${btcPct}%`;
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
    const el = document.getElementById(id);
    const container = el ? el.parentElement : null;
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

/**
 * ✅ FUNCIÓN AGREGADA: Para evitar el ReferenceError
 */
function setupChartSelectors() {
    const selectors = document.querySelectorAll('.chart-range-selector');
    selectors.forEach(btn => {
        btn.addEventListener('click', () => {
            selectors.forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            refreshAnalytics(); // Recarga datos según el rango seleccionado
        });
    });
}