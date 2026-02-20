/**
 * dashboard.js - Controlador de Interfaz (Versión Sincronizada 2026)
 * Estado: Corregido renderizado de Balance y enlace de Métricas
 */
import { fetchEquityCurveData, triggerPanicStop, toggleBotSideState } from './apiService.js'; 
import { currentBotState } from '../main.js'; 
import { socket } from './socket.js';
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

    // 1. Inicializar Gráficos
    initBalanceChart(); // Ya no necesita el state aquí, se actualiza en el paso 2
    initEquityChart();

    // 2. Sincronización inmediata con el estado global
    if (stateToUse) {
        updateBotUI(stateToUse);
        // Pequeño delay para asegurar que el canvas de Chart.js esté listo
        setTimeout(() => {
            updateDistributionWidget(stateToUse);
        }, 300);
    }

    // 3. Configurar Eventos y Botones Locales
    setupActionButtons();
    setupAnalyticsFilters();
    
    // 4. Escuchar actualizaciones desde MetricsManager
    window.addEventListener('metricsUpdated', (e) => {
        if (e.detail) {
            updateEquityChart(e.detail);
        }
    });

    // 5. Carga inicial de analítica
    refreshAnalytics();

    // 6. Estado de conexión inicial
    updateHealthStatus('health-market-ws-text', socket?.connected);
    updateHealthStatus('health-user-ws-text', socket?.connected);
}

/**
 * AGREGAR LOG AL TERMINAL
 */
export function addTerminalLog(msg, type = 'info') {
    const logContainer = document.getElementById('dashboard-logs');
    if (!logContainer) return;

    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const colors = {
        info: 'text-gray-400 border-gray-700',
        success: 'text-emerald-400 border-emerald-500/50',
        warning: 'text-yellow-400 border-yellow-500/50',
        error: 'text-red-400 border-red-500/50'
    };

    const logEntry = document.createElement('div');
    logEntry.className = `flex gap-2 py-1 px-2 border-l-2 bg-white/5 mb-1 text-[10px] font-mono transition-all duration-500 rounded-r animate-fadeIn ${colors[type] || colors.info}`;
    
    logEntry.innerHTML = `
        <span class="opacity-30 font-bold">[${timestamp}]</span>
        <span class="flex-grow tracking-tighter uppercase">${msg}</span>
        <i class="fas fa-circle text-[6px] self-center animate-pulse ${type === 'success' ? 'text-emerald-500' : 'text-gray-600'}"></i>
    `;

    logContainer.prepend(logEntry);
    while (logContainer.childNodes.length > 40) {
        logContainer.lastChild.remove();
    }
}

/**
 * CONFIGURACIÓN DE BOTONES
 */
function setupActionButtons() {
    const panicBtn = document.getElementById('panic-btn');
    if (panicBtn) {
        panicBtn.onclick = async () => {
            const confirmPanic = confirm("🚨 ¿ESTÁS SEGURO? Se detendrán todos los bots y se cancelarán órdenes.");
            if (confirmPanic) await triggerPanicStop();
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
 * Refresca analítica (Gráfico de Equity)
 */
async function refreshAnalytics() {
    try {
        const curveData = await fetchEquityCurveData();
        if (curveData) {
            Metrics.setAnalyticsData(curveData);
            // El updateEquityChart se disparará vía el evento 'metricsUpdated'
        }
    } catch (e) { 
        console.error("❌ Error en Dashboard Metrics:", e.message); 
    }
}

// --- GESTIÓN DE GRÁFICOS ---

function initBalanceChart() {
    const canvas = document.getElementById('balanceDonutChart');
    if (!canvas) return;
    if (balanceChart) balanceChart.destroy();

    balanceChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['USDT', 'BTC'],
            datasets: [{ 
                data: [100, 0], // Valores iniciales placeholder
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

/**
 * Actualiza el círculo de balance y las barras de progreso
 */
export function updateDistributionWidget(state) {
    if (!balanceChart || !state) return;
    
    const usdt = parseFloat(state.lastAvailableUSDT || 0);
    const btcAmount = parseFloat(state.lastAvailableBTC || 0);
    const price = parseFloat(state.price || 0);
    
    if (price > 0) {
        const btcInUsdt = btcAmount * price;
        const total = usdt + btcInUsdt;

        if (total > 0) {
            // Actualización del gráfico de dona
            balanceChart.data.datasets[0].data = [usdt, btcInUsdt];
            balanceChart.update();

            // Actualización de las barras horizontales
            const usdtBar = document.getElementById('usdt-bar');
            const btcBar = document.getElementById('btc-bar');
            if (usdtBar) usdtBar.style.width = `${(usdt / total) * 100}%`;
            if (btcBar) btcBar.style.width = `${(btcInUsdt / total) * 100}%`;
        }
    }
    
    // Actualización de textos
    const uText = document.getElementById('aubalance-usdt');
    const bText = document.getElementById('aubalance-btc');
    if(uText) uText.innerText = usdt.toLocaleString('en-US', { minimumFractionDigits: 2 });
    if(bText) bText.innerText = btcAmount.toFixed(6);
}

/**
 * Renderiza los puntos en la curva de equity
 */
export function updateEquityChart(data) {
    if (!equityChart || !data || !data.points) return;
    equityChart.data.labels = data.points.map(p => p.time);
    equityChart.data.datasets[0].data = data.points.map(p => p.value);
    equityChart.update();
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