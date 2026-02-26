/**
 * dashboard.js - Controlador de Interfaz (Versión Blindada 2026)
 * Estado: Sincronizado con validaciones de AI y Autobot.
 * Actualización: Filtros vinculados a MetricsManager.
 */
import { fetchEquityCurveData, triggerPanicStop, toggleBotSideState, sendConfigToBackend } from './apiService.js'; 
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
    setupAnalyticsFilters(); // <--- Aquí se vinculan los selectores
    
    // 4. Gestión de eventos de Metrics (Evita duplicados)
    window.removeEventListener('metricsUpdated', handleMetricsUpdate);
    window.addEventListener('metricsUpdated', handleMetricsUpdate);

    // 5. Carga de analítica (Equity)
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
        const response = await fetchEquityCurveData();
        
        if (response && response.success && Array.isArray(response.data)) {
            // 1. Enviamos los TradeCycles al manager
            Metrics.setAnalyticsData(response.data);
            
            addTerminalLog("ANALYTICS: CURVA DE EQUIDAD ACTUALIZADA", 'success');
        } else {
            addTerminalLog("ANALYTICS: SIN DATOS HISTÓRICOS", 'warning');
        }
    } catch (e) { 
        console.error("❌ Error en Dashboard Metrics:", e.message); 
        addTerminalLog("ERROR AL CARGAR ANALÍTICA", 'error');
    }
}

/**
 * CONFIGURACIÓN DE FILTROS DE ANALÍTICA (Long, Short, AI)
 * Esta función conecta los selectores HTML con el MetricsManager
 */
function setupAnalyticsFilters() {
    const bSel = document.getElementById('chart-bot-selector');
    const pSel = document.getElementById('chart-param-selector');

    if (bSel) {
        bSel.onchange = () => {
            // SOLO cambia el filtro, NO carga datos de nuevo
            Metrics.setBotFilter(bSel.value); 
        };
    }

    if (pSel) {
        pSel.onchange = () => {
            // Esto actualiza el eje Y (Profit vs %) y dispara el evento
            Metrics.setChartParameter(pSel.value); 
        };
    }
}

/**
 * CONFIGURACIÓN DE BOTONES (Long, Short, AI) Y INPUTS RÁPIDOS
 */
function setupActionButtons() {
    const panicBtn = document.getElementById('panic-btn');
    if (panicBtn) {
        panicBtn.onclick = async () => {
            const confirmPanic = confirm("🚨 ¿ESTÁS SEGURO? Se detendrán todos los bots y cerrarán posiciones.");
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
                let isRunning = false;
                if (btn.side === 'long') isRunning = currentBotState.lstate !== 'STOPPED';
                else if (btn.side === 'short') isRunning = currentBotState.sstate !== 'STOPPED';
                else if (btn.side === 'ai') isRunning = currentBotState.aistate === 'RUNNING';

                await toggleBotSideState(isRunning, btn.side);
            };
        }
    });

   const quickInputs = [
        { id: 'auamountl-usdt', label: 'LONG', strategy: 'long' },
        { id: 'auamounts-usdt', label: 'SHORT', strategy: 'short' },
        { id: 'auamountai-usdt', label: 'AI', strategy: 'ai' }
    ];

    quickInputs.forEach(input => {
        const el = document.getElementById(input.id);
        if (el) {
            el.onchange = async () => {
                // Obtenemos el nuevo valor escrito por el usuario
                const newVal = parseFloat(el.value);
                
                // Preparamos el paquete de datos con el PLAN B
                const configPayload = {
                    config: {
                        [input.strategy]: { amountUsdt: newVal }
                    },
                    applyShield: true,   // <--- Avisamos que queremos blindaje
                    strategy: input.strategy // <--- Decimos qué estrategia blindar
                };

                // Enviamos al backend. Nota: asegúrate que apiService acepte argumentos si es necesario, 
                // o que lea el estado actual de los inputs.
                const res = await sendConfigToBackend(configPayload); 
                
                if (res && res.success) {
                    addTerminalLog(`CONFIG: ${input.label} BLINDAJE APLICADO ($${newVal})`, 'success');
                } else {
                    addTerminalLog(`ERROR AL APLICAR BLINDAJE EN ${input.label}`, 'error');
                }
            };
        }
    });
}

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
    logEntry.className = `flex gap-2 py-1 px-2 border-l-2 bg-white/5 mb-1 text-[10px] font-mono rounded-r animate-fadeIn ${colors[type] || colors.info}`;
    
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

function initBalanceChart() {
    const canvas = document.getElementById('balanceDonutChart');
    if (!canvas) return;

    if (balanceChart) {
        balanceChart.destroy();
        balanceChart = null; 
    }

    const ctx = canvas.getContext('2d');
    
    balanceChart = new Chart(ctx, {
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
            animation: { duration: 400 }
        }
    });

    if (currentBotState.lastAvailableUSDT || currentBotState.lastAvailableBTC) {
        updateDistributionWidget(currentBotState);
    }
}

export function updateDistributionWidget(state) {
    if (!balanceChart || !state) return;
    
    const usdt = Math.max(0, parseFloat(state.lastAvailableUSDT || 0));
    const btcAmount = Math.max(0, parseFloat(state.lastAvailableBTC || 0));
    const price = Math.max(0, parseFloat(state.price || 0));
    
    const uText = document.getElementById('aubalance-usdt');
    const bText = document.getElementById('aubalance-btc');
    if(uText) uText.innerText = usdt.toLocaleString('en-US', { minimumFractionDigits: 2 });
    if(bText) bText.innerText = btcAmount.toFixed(6);

    if (price > 0) {
        const btcInUsdt = btcAmount * price;
        const total = usdt + btcInUsdt;

        if (total > 0) {
            balanceChart.data.datasets[0].data = [usdt, btcInUsdt];
            balanceChart.update('none'); 

            const usdtBar = document.getElementById('usdt-bar');
            const btcBar = document.getElementById('btc-bar');
            
            const usdtPct = (usdt / total) * 100;
            const btcPct = (btcInUsdt / total) * 100;

            if (usdtBar) usdtBar.style.width = `${usdtPct}%`;
            if (btcBar) btcBar.style.width = `${btcPct}%`;
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