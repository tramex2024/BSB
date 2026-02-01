/**
 * dashboard.js - Controlador de Interfaz y Eventos (Versión Optimizada 2026)
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

/**
 * Inicializa la vista del Dashboard
 */
export function initializeDashboardView(initialState) {
    console.log("📊 Dashboard: Sincronizando sistema...");

    initBalanceChart();

    // Sincronización inmediata con el estado global
    const stateToUse = initialState || currentBotState;
    if (stateToUse) {
        updateBotUI(stateToUse);
        updateDistributionWidget(stateToUse);
    }

    setupSocketListeners();
    setupChartSelectors(); 
    setupTestButton(); 
    
    // Carga de analítica (Gráficos de rendimiento)
    refreshAnalytics();

    // Estado de conexión inicial
    updateHealthStatus('health-market-ws-text', socket?.connected);
}

/**
 * Refresca los datos de la curva de equidad
 */
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

/**
 * Configura los eventos en tiempo real para el Dashboard
 */
function setupSocketListeners() {
    if (!socket) return;

    // Limpieza de duplicados
    socket.off('market-signal-update');
    socket.off('order-executed');
    socket.off('cycle-closed');
    socket.off('ai-decision-update');
    socket.off('ai-status-update');

    // Señales de mercado (RSI/Análisis)
    socket.on('market-signal-update', (analysis) => {
        const signalEl = document.getElementById('health-analyzer-signal');
        if (signalEl) {
            signalEl.textContent = `RSI: ${analysis.currentRSI.toFixed(1)} | ${analysis.action}`;
            signalEl.className = `text-[9px] font-bold ${analysis.action === 'BUY' ? 'text-emerald-400' : analysis.action === 'SELL' ? 'text-red-400' : 'text-blue-400'}`;
        }
    });

    // Ejecución de órdenes (Sonidos y efectos visuales)
    socket.on('order-executed', (order) => {
        try {
            order.side.toLowerCase() === 'buy' ? sounds.buy.play() : sounds.sell.play();
            flashElement('auprice', order.side.toLowerCase() === 'buy' ? 'bg-emerald-500/20' : 'bg-orange-500/20');
        } catch (e) {}
    });

    // Cierre de ciclo de ganancias
    socket.on('cycle-closed', () => {
        if(sounds.sell) sounds.sell.play();
        flashElement('auprofit', 'bg-yellow-500/30');
        refreshAnalytics(); 
    });

    // Actualizaciones de pensamiento de la IA (Mini widget)
    socket.on('ai-decision-update', (data) => {
        const confidenceVal = Math.round(data.confidence * 100);
        updateElementText('ai-mini-confidence', `${confidenceVal}%`);
        updateElementText('ai-mini-thought', data.message);
    });

    // Sincronización de balance de IA con el Widget de Distribución
    socket.on('ai-status-update', (data) => {
        if (data.virtualBalance !== undefined) {
            // Actualizamos la memoria global y la UI
            currentBotState.virtualBalance = data.virtualBalance;
            updateDistributionWidget(currentBotState);
            
            // Si existe el elemento de balance en el dashboard, lo actualizamos
            const balDash = document.getElementById('ai-virtual-balance-dash');
            if(balDash) balDash.innerText = `$${parseFloat(data.virtualBalance).toFixed(2)}`;
        }
    });
}

// --- UTILIDADES DE UI ---

/**
 * Inicializa el gráfico circular de distribución
 */
function initBalanceChart() {
    const canvas = document.getElementById('balanceDonutChart');
    if (!canvas) return;
    if (balanceChart) balanceChart.destroy();
    
    balanceChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['USDT', 'BTC'],
            datasets: [{ 
                data: [100, 0], 
                backgroundColor: ['#10b981', '#f59e0b'], 
                borderWidth: 0, 
                cutout: '75%',
                hoverOffset: 4
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

/**
 * Actualiza el Widget de Distribución de activos (USDT vs BTC)
 */
function updateDistributionWidget(state) {
    if (!balanceChart) return;
    
    // Fallback inteligente: Busca balance de IA o balance de Autobot según disponibilidad
    const usdt = parseFloat(state.lastAvailableUSDT || state.virtualBalance || state.virtualAiBalance || 0);
    const btcAmount = parseFloat(state.lastAvailableBTC || 0);
    const price = parseFloat(state.price || 0);
    
    const btcInUsdt = btcAmount * price;
    const total = usdt + btcInUsdt;

    // Si no hay fondos, mostramos 100% USDT de forma visual
    const displayUsdt = total === 0 ? 100 : (usdt / total) * 100;
    const displayBtc = total === 0 ? 0 : (btcInUsdt / total) * 100;

    balanceChart.data.datasets[0].data = [displayUsdt, displayBtc];
    balanceChart.update();
    
    // Actualización de barras de progreso
    const usdtBar = document.getElementById('usdt-bar');
    const btcBar = document.getElementById('btc-bar');
    if (usdtBar) usdtBar.style.width = `${displayUsdt}%`;
    if (btcBar) btcBar.style.width = `${displayBtc}%`;

    // Actualización de etiquetas de porcentaje
    updateElementText('usdt-pct-text', `${Math.round(displayUsdt)}%`);
    updateElementText('btc-pct-text', `${Math.round(displayBtc)}%`);
}

/**
 * Actualiza el texto de estado de salud del sistema
 */
function updateHealthStatus(textId, isOnline) {
    const txt = document.getElementById(textId);
    if (txt) {
        txt.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
        txt.className = `text-[9px] font-mono font-bold ${isOnline ? 'text-emerald-500' : 'text-red-400'}`;
    }
}

/**
 * Efecto de destello visual en elementos al recibir datos
 */
function flashElement(id, colorClass) {
    const el = document.getElementById(id);
    const container = el ? el.parentElement : null;
    if (container) {
        container.classList.add(colorClass, 'transition-colors', 'duration-300');
        setTimeout(() => container.classList.remove(colorClass), 800);
    }
}

function updateElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

/**
 * Botón de prueba para verificar notificaciones visuales
 */
function setupTestButton() {
    const testBtn = document.getElementById('test-notification-btn');
    if (!testBtn) return;
    testBtn.onclick = () => {
        flashElement('auprice', 'bg-emerald-500/40');
        if(sounds.buy) sounds.buy.play();
    };
}

/**
 * Selectores de rango para el gráfico de rendimiento
 */
function setupChartSelectors() {
    const selectors = document.querySelectorAll('.chart-range-selector');
    selectors.forEach(btn => {
        btn.addEventListener('click', () => {
            selectors.forEach(s => s.classList.remove('active', 'bg-blue-600'));
            btn.classList.add('active', 'bg-blue-600');
            refreshAnalytics(); 
        });
    });
}