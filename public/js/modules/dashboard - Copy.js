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

// [NUEVO] Importamos el modal de confirmación
import { askConfirmation } from './confirmModal.js';

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
    console.log("📊 Dashboard: Synchronizing system...");

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
        
        // Sincronizar barras de PnL inmediatamente con el estado persistente
        updatePnLBar('long', stateToUse.lprofit || 0);
        updatePnLBar('short', stateToUse.sprofit || 0);
        updatePnLBar('ai', stateToUse.aiprofit || 0);

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
            Metrics.setAnalyticsData(response.data);
            addTerminalLog("ANALYTICS: SYNCHRONIZED HISTORY", 'success');
        } else {
            addTerminalLog("ANALYTICS: NO PREVIOUS DATA", 'warning');
            renderEquityCurve([]); 
        }
    } catch (e) { 
        console.error("❌ Error en Dashboard Metrics:", e.message); 
        addTerminalLog("ERROR LOADING ANALYTICS", 'error');
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
            addTerminalLog(`FILTERED VIEW: ${bSel.value.toUpperCase()}`, 'info');
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
            // Usamos el modal de confirmación aquí también para consistencia
            const confirmado = await askConfirmation('PANIC', 'stop');
            if (confirmado) {
                await triggerPanicStop();
                addTerminalLog("PANIC STOP EXECUTED", 'error');
            }
        };
    }

    const btnConfigs = [
        { id: 'austartl-btn', side: 'long' },
        { id: 'austarts-btn', side: 'short' },
        { id: 'btn-start-ai', side: 'ai' },
        { id: 'austartai-btn', side: 'ai' }
    ];

    btnConfigs.forEach(btnConfig => {
        const el = document.getElementById(btnConfig.id);
        if (el) {
            el.onclick = async (e) => {
                e.preventDefault();
                
                let isRunning = false;
                if (btnConfig.side === 'long') isRunning = currentBotState.lstate === 'RUNNING';
                else if (btnConfig.side === 'short') isRunning = currentBotState.sstate === 'RUNNING';
                else if (btnConfig.side === 'ai') isRunning = currentBotState.aistate === 'RUNNING';

                const action = isRunning ? 'stop' : 'start';

                // [NUEVO] Solicitamos confirmación antes de proceder
                const confirmado = await askConfirmation(btnConfig.side, action);
                if (!confirmado) return;

                // Animación de carga en el botón
                const originalHTML = el.innerHTML;
                el.disabled = true;
                el.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i>`;

                try {
                    await toggleBotSideState(isRunning, btnConfig.side);
                    addTerminalLog(`${btnConfig.side.toUpperCase()}: ${action.toUpperCase()} SENT`, 'info');
                } catch (error) {
                    addTerminalLog(`ERROR: ${error.message}`, 'error');
                } finally {
                    el.disabled = false;
                    el.innerHTML = originalHTML;
                }
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
                    addTerminalLog(`CONFIG: ${input.strategy.toUpperCase()} UPDATED TO $${newVal}`, 'success');
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

/**
 * Actualiza visualmente las barras de PnL dinámicas en el Dashboard
 */
export function updatePnLBar(id, pnlValue) {
    const bar = document.getElementById(`pnl-bar-${id}`);
    if (!bar) return;

    const pnl = parseFloat(pnlValue) || 0;
    const maxRange = 1; 
    const visualSize = Math.min(Math.abs(pnl) / maxRange * 50, 50);

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

function updateHealthStatus(textId, isOnline) {
    const txt = document.getElementById(textId);
    if (txt) {
        txt.textContent = isOnline ? 'CONNECTED' : 'OFFLINE';
        txt.className = `font-mono font-bold ${isOnline ? 'text-emerald-500' : 'text-red-400'}`;
    }
}