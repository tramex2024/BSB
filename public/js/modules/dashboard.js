/**
 * dashboard.js - Controlador de Interfaz (Versión Blindada 2026)
 * Estado: Corregido error de auto-borrado y reseteo de balance.
 */
import { fetchEquityCurveData, triggerPanicStop, toggleBotSideState } from './apiService.js'; 
import { currentBotState } from '../main.js'; 
import { socket } from './socket.js';
import { updateBotUI } from './uiManager.js';
import * as Metrics from './metricsManager.js';
import { renderEquityCurve } from './chart.js';

// Instancias globales de gráficos
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

    const stateToUse = initialState || currentBotState;

    // 1. Inicializar Gráfico de Balance (Dona) 
    // Corregido para no pisar datos existentes
    initBalanceChart();

    // 2. Sincronización inmediata con el estado global
    if (stateToUse) {
        updateBotUI(stateToUse);
        requestAnimationFrame(() => {
            updateDistributionWidget(stateToUse);
        });
    }

    // 3. Configurar Eventos y Botones Locales
    setupActionButtons();
    setupAnalyticsFilters();
    
    // 4. Gestión de eventos de Metrics (Evita duplicados)
    window.removeEventListener('metricsUpdated', handleMetricsUpdate);
    window.addEventListener('metricsUpdated', handleMetricsUpdate);

    // 5. Carga de analítica (Equity) - Se ejecuta al final
    refreshAnalytics();

    // 6. Estado de conexión
    updateHealthStatus('health-market-ws-text', socket?.connected);
    updateHealthStatus('health-user-ws-text', socket?.connected);
}

function handleMetricsUpdate(e) {
    if (e.detail) {
        renderEquityCurve(e.detail);
    }
}

/**
 * Refresca analítica con protección contra borrado accidental
 */
async function refreshAnalytics() {
    try {
        // Renderizado preventivo si ya tenemos datos locales
        const initialPoints = Metrics.getFilteredData();
        if (initialPoints?.points?.length > 0) {
            renderEquityCurve(initialPoints);
        }

        const curveData = await fetchEquityCurveData();
        if (curveData && Array.isArray(curveData) && curveData.length > 0) {
            Metrics.setAnalyticsData(curveData);
            
            // Timeout estratégico para esperar que el DOM se asiente
            setTimeout(() => {
                const updatedData = Metrics.getFilteredData();
                renderEquityCurve(updatedData);
            }, 300);
        }
    } catch (e) { 
        console.error("❌ Error en Dashboard Metrics:", e.message); 
    }
}

/**
 * CONFIGURACIÓN DE BOTONES
 */
function setupActionButtons() {
    const panicBtn = document.getElementById('panic-btn');
    if (panicBtn) {
        panicBtn.onclick = async () => {
            const confirmPanic = confirm("🚨 ¿ESTÁS SEGURO? Se detendrán todos los bots.");
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

// --- GESTIÓN DE GRÁFICOS ---

function initBalanceChart() {
    const canvas = document.getElementById('balanceDonutChart');
    if (!canvas) return;

    if (!balanceChart) {
        balanceChart = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['USDT', 'BTC'],
                datasets: [{ 
                    data: [100, 0], 
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

    // Si ya tenemos balance en el estado global, lo aplicamos de inmediato
    if (currentBotState.lastAvailableUSDT || currentBotState.lastAvailableBTC) {
        updateDistributionWidget(currentBotState);
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
            balanceChart.update('none'); // Update suave sin saltos

            const usdtBar = document.getElementById('usdt-bar');
            const btcBar = document.getElementById('btc-bar');
            if (usdtBar) usdtBar.style.width = `${(usdt / total) * 100}%`;
            if (btcBar) btcBar.style.width = `${(btcInUsdt / total) * 100}%`;
        }
    }
    
    const uText = document.getElementById('aubalance-usdt');
    const bText = document.getElementById('aubalance-btc');
    if(uText) uText.innerText = usdt.toLocaleString('en-US', { minimumFractionDigits: 2 });
    if(bText) bText.innerText = btcAmount.toFixed(6);
}

function setupAnalyticsFilters() {
    const bSel = document.getElementById('chart-bot-selector');
    const pSel = document.getElementById('chart-param-selector');

    const update = () => {
        const filtered = Metrics.getFilteredData({ bot: bSel.value, param: pSel.value });
        renderEquityCurve(filtered);
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