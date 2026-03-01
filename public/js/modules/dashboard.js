/**
 * dashboard.js - Controlador de Interfaz (Versión Blindada 2026)
 * Estado: Sincronizado con MetricsManager y Chart.js.
 */
import { 
    fetchEquityCurveData, 
    triggerPanicStop, 
    toggleBotSideState, 
    sendConfigToBackend 
} from './apiService.js'; 
import { currentBotState } from '../main.js'; 
import { socket } from './socket.js';
import { updateBotUI } from './uiManager.js';
import * as Metrics from './metricsManager.js';
import { renderEquityCurve, initializeChart } from './chart.js';

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

    // 1. CONFIGURAR ESCUCHADORES (Antes de cualquier carga de datos)
    window.removeEventListener('metricsUpdated', handleMetricsUpdate);
    window.addEventListener('metricsUpdated', handleMetricsUpdate);

    // 2. INICIALIZAR COMPONENTES VISUALES
    initBalanceChart();
    
    // Inicializar TradingView (Precios en vivo)
    if (stateToUse?.symbol) {
        initializeChart('tv-chart-container', stateToUse.symbol);
    }

    // 3. ACTUALIZACIÓN DE UI INICIAL
    if (stateToUse) {
        updateBotUI(stateToUse);
        // Pequeño delay para asegurar que el DOM del donut esté listo
        setTimeout(() => updateDistributionWidget(stateToUse), 150);
    }

    // 4. CONFIGURAR INTERACTIVIDAD
    setupActionButtons();
    setupAnalyticsFilters();
    
    // 5. CARGA DE DATOS HISTÓRICOS (Esto disparará el evento metricsUpdated)
    refreshAnalytics();

    // 6. ESTADO DE CONEXIÓN
    updateHealthStatus('health-market-ws-text', socket?.connected);
    updateHealthStatus('health-user-ws-text', socket?.connected);
}

/**
 * Manejador del evento de métricas: Recibe datos procesados y renderiza
 */
function handleMetricsUpdate(e) {
    if (e.detail) {
        console.log("📈 Dashboard: Renderizando Curva de Equidad...", e.detail);
        // requestAnimationFrame asegura que el canvas tenga dimensiones antes de dibujar
        requestAnimationFrame(() => {
            renderEquityCurve(e.detail);
        });
    }
}

/**
 * Refresca analítica desde el servidor y sincroniza el MetricsManager
 */
async function refreshAnalytics() {
    try {
        const response = await fetchEquityCurveData();
        
        if (response && response.success && Array.isArray(response.data)) {
            // Enviamos los datos al manager para filtrado y acumulación
            Metrics.setAnalyticsData(response.data);
            addTerminalLog("ANALYTICS: HISTORIAL SINCRONIZADO", 'success');
        } else {
            addTerminalLog("ANALYTICS: SIN DATOS PREVIOS", 'warning');
            renderEquityCurve([]); // Renderiza estado vacío elegante
        }
    } catch (e) { 
        console.error("❌ Error en Dashboard Metrics:", e.message); 
        addTerminalLog("ERROR AL CARGAR ANALÍTICA", 'error');
    }
}

/**
 * Vinculación de filtros de la gráfica (Long, Short, AI, Profit, %)
 */
function setupAnalyticsFilters() {
    const bSel = document.getElementById('chart-bot-selector');
    const pSel = document.getElementById('chart-param-selector');

    if (bSel) {
        bSel.onchange = () => {
            Metrics.setBotFilter(bSel.value);
            addTerminalLog(`VISTA FILTRADA: ${bSel.value.toUpperCase()}`, 'info');
        };
    }

    if (pSel) {
        pSel.onchange = () => {
            Metrics.setChartParameter(pSel.value);
        };
    }
}

/**
 * Configuración de botones de acción y inputs de configuración rápida
 */
function setupActionButtons() {
    const panicBtn = document.getElementById('panic-btn');
    if (panicBtn) {
        panicBtn.onclick = async () => {
            if (confirm("🚨 ¿ESTÁS SEGURO? Se detendrán todos los bots y cerrarán posiciones.")) {
                await triggerPanicStop();
            }
        };
    }

    const btnConfigs = [
        { id: 'austartl-btn', side: 'long' },
        { id: 'austarts-btn', side: 'short' },
        { id: 'btn-start-ai', side: 'ai' },
        { id: 'austartai-btn', side: 'ai' }
    ];

    btnConfigs.forEach(btn => {
        const el = document.getElementById(btn.id);
        if (el) {
            el.onclick = async () => {
                let isRunning = false;
                if (btn.side === 'long') isRunning = currentBotState.lstate !== 'STOPPED';
                else if (btn.side === 'short') isRunning = currentBotState.sstate !== 'STOPPED';
                else if (btn.side === 'ai') isRunning = currentBotState.aistate === 'RUNNING';

                await toggleBotSideState(isRunning, btn.side);
            };
        }
    });

    // Inputs Rápidos (Amount USDT)
    const quickInputs = [
        { id: 'auamountl-usdt', strategy: 'long' },
        { id: 'auamounts-usdt', strategy: 'short' },
        { id: 'auamountai-usdt', strategy: 'ai' }
    ];

    quickInputs.forEach(input => {
        const el = document.getElementById(input.id);
        if (el) {
            el.onchange = async () => {
                const newVal = parseFloat(el.value);
                const configPayload = {
                    config: { [input.strategy]: { amountUsdt: newVal } },
                    applyShield: true,
                    strategy: input.strategy
                };

                const res = await sendConfigToBackend(configPayload);
                if (res?.success) {
                    addTerminalLog(`CONFIG: ${input.strategy.toUpperCase()} ACTUALIZADO A $${newVal}`, 'success');
                }
            };
        }
    });
}

/**
 * Terminal de Logs del Dashboard
 */
export function addTerminalLog(msg, type = 'info') {
    const logContainer = document.getElementById('dashboard-logs');
    if (!logContainer) return;

    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const colors = {
        info: 'text-gray-400 border-gray-700',
        success: 'text-emerald-400 border-emerald-500/50',
        warning: 'text-yellow-400 border-yellow-500/50',
        error: 'text-red-400 border-red-500/50'
    };

    const logEntry = document.createElement('div');
    logEntry.className = `flex gap-2 py-1 px-2 border-l-2 bg-white/5 mb-1 text-[10px] font-mono rounded-r animate-fadeIn ${colors[type] || colors.info}`;
    logEntry.innerHTML = `
        <span class="opacity-30 font-bold">[${timestamp}]</span>
        <span class="flex-grow tracking-tighter uppercase">${msg}</span>
        <i class="fas fa-circle text-[6px] self-center ${type === 'success' ? 'text-emerald-500' : 'text-gray-600'}"></i>
    `;

    logContainer.prepend(logEntry);
    if (logContainer.childNodes.length > 40) logContainer.lastChild.remove();
}

/**
 * Gráfico de Distribución (Donut)
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
                backgroundColor: ['#10b981', '#fb923c'], 
                borderWidth: 0, 
                cutout: '75%'
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false } }
        }
    });
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

function updateHealthStatus(textId, isOnline) {
    const txt = document.getElementById(textId);
    if (txt) {
        txt.textContent = isOnline ? 'CONNECTED' : 'OFFLINE';
        txt.className = `font-mono font-bold ${isOnline ? 'text-emerald-500' : 'text-red-400'}`;
    }
}