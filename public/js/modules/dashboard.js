/**
 * dashboard.js - Gestión del Panel Principal
 * Sincronizado con la Memoria Central del Main.js
 */

import { fetchEquityCurveData, fetchCycleKpis } from './apiService.js'; 
import { renderEquityCurve } from './chart.js';
import { socket } from '../main.js'; 
import { updateBotUI } from './uiManager.js';

let cycleHistoryData = []; 
let currentChartParameter = 'accumulatedProfit'; 
let balanceChart = null; // Variable para el gráfico circular

// --- CONFIGURACIÓN DE AUDIO ---
const sounds = {
    buy: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'),
    sell: new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'),
};
Object.values(sounds).forEach(s => s.volume = 0.4);

/**
 * Inicialización principal del Dashboard
 */
export function initializeDashboardView(initialState) {
    console.log("📊 Dashboard: Sincronizando con Memoria Central");

    // 1. Inicializar componentes visuales
    initBalanceChart();

    // 2. Aplicar estado inicial inmediatamente
    if (initialState) {
        updateBotUI(initialState);
        updateDistributionWidget(initialState);
    }

    // 3. Limpieza de listeners previos para evitar duplicidad
    if (socket) {
        socket.off('market-signal-update');
        socket.off('order-executed');
        socket.off('cycle-closed');
        socket.off('ai-decision-update');
        socket.off('bot-state-update');
    }

    // 4. Activar componentes de la interfaz
    setupSocketListeners();
    setupChartSelector();
    setupTestButton(); 
    
    // 5. Carga de datos externos (Gráficos y KPIs)
    loadAndRenderEquityCurve();
    loadAndDisplayKpis();

    // 6. Actualización de salud visual
    updateHealthStatus('health-market-ws-text', socket?.connected);
}

/**
 * Inicializa el gráfico de Dona (USDT vs BTC)
 */
function initBalanceChart() {
    const canvas = document.getElementById('balanceDonutChart');
    if (!canvas) return;

    // Si ya existe un gráfico, lo destruimos para crear uno limpio
    if (balanceChart) {
        balanceChart.destroy();
    }

    const ctx = canvas.getContext('2d');
    balanceChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['USDT', 'BTC'],
            datasets: [{
                data: [100, 0], 
                backgroundColor: ['#10b981', '#f59e0b'], // Esmeralda para USDT, Naranja para BTC
                borderWidth: 0,
                cutout: '75%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            animation: { duration: 800 }
        }
    });
}

/**
 * Actualiza el Widget de Distribución con datos reales
 */
function updateDistributionWidget(state) {
    if (!balanceChart) return;

    const usdt = parseFloat(state.balances?.USDT || 0);
    const btcAmount = parseFloat(state.balances?.BTC || 0);
    const price = parseFloat(state.marketPrice || 0);
    
    // Calculamos el valor de BTC en dólares para comparar peras con peras
    const btcInUsdt = btcAmount * price;
    const total = usdt + btcInUsdt;

    if (total > 0) {
        const usdtPct = (usdt / total) * 100;
        const btcPct = (btcInUsdt / total) * 100;

        // Actualizar Gráfico Circular
        balanceChart.data.datasets[0].data = [usdtPct, btcPct];
        balanceChart.update();

        // Actualizar Barras de progreso (las líneas horizontales)
        const usdtBar = document.getElementById('usdt-bar');
        const btcBar = document.getElementById('btc-bar');
        if (usdtBar) usdtBar.style.width = `${usdtPct}%`;
        if (btcBar) btcBar.style.width = `${btcPct}%`;
    }
}

/**
 * Gestión de Sockets
 */
function setupSocketListeners() {
    if (!socket) return;

    // Señales del Analizador RSI
    socket.on('market-signal-update', (analysis) => {
        const signalEl = document.getElementById('health-analyzer-signal');
        const reasonEl = document.getElementById('health-analyzer-reason');
        
        if (signalEl) {
            signalEl.textContent = `RSI: ${analysis.currentRSI.toFixed(1)} | ${analysis.action}`;
            if (analysis.action === 'BUY') signalEl.className = 'text-[9px] font-bold text-emerald-400';
            else if (analysis.action === 'SELL') signalEl.className = 'text-[9px] font-bold text-red-400';
            else signalEl.className = 'text-[9px] font-bold text-blue-400';
        }
        if (reasonEl) reasonEl.textContent = analysis.reason || 'Analizando...';
    });

    // Notificaciones de Ejecución
    socket.on('order-executed', (order) => {
        const side = order.side.toLowerCase();
        if (side === 'buy') {
            sounds.buy.play().catch(() => {});
            flashElement('auprice', 'bg-emerald-500/20');
        } else {
            sounds.sell.play().catch(() => {});
            flashElement('auprice', 'bg-orange-500/20');
        }
    });
    
    // Latido del bot (State Update)
    socket.on('bot-state-update', (fullState) => {
        updateBotUI(fullState);
        updateDistributionWidget(fullState); // Sincroniza el gráfico de balance
    });
 
    // Evento de cierre de ciclo
    socket.on('cycle-closed', () => {
        sounds.sell.play().catch(() => {});
        flashElement('auprofit', 'bg-yellow-500/30');
        loadAndRenderEquityCurve();
        loadAndDisplayKpis();
    });

    // Mini-Widget de IA
    socket.on('ai-decision-update', (data) => {
        const confidenceVal = Math.round(data.confidence * 100);
        updateElementText('ai-mini-confidence', `${confidenceVal}%`);
        
        const progressEl = document.getElementById('ai-mini-progress');
        if (progressEl) {
            const radius = 15.9155;
            const circumference = 2 * Math.PI * radius;
            progressEl.style.strokeDasharray = `${(confidenceVal * circumference) / 100}, ${circumference}`;
        }

        updateElementText('ai-mini-thought', data.message);

        const actionEl = document.getElementById('ai-mini-action');
        if (actionEl) {
            const isHigh = confidenceVal > 80;
            actionEl.textContent = isHigh ? "ALTA PROBABILIDAD" : "ANALIZANDO PATRONES";
            actionEl.className = `text-[9px] font-bold mt-1 uppercase ${isHigh ? 'text-emerald-400' : 'text-blue-400'}`;
        }
    });
}

/**
 * Selector de parámetros para el gráfico de Chart.js
 */
function setupChartSelector() {
    const selector = document.getElementById('chart-param-selector');
    if (selector) {
        selector.addEventListener('change', (e) => {
            currentChartParameter = e.target.value;
            if (cycleHistoryData.length > 0) {
                renderEquityCurve(cycleHistoryData, currentChartParameter);
            }
        });
    }
}

/**
 * Botón de prueba
 */
function setupTestButton() {
    const testBtn = document.getElementById('test-notification-btn');
    if (!testBtn) return;

    const newBtn = testBtn.cloneNode(true);
    testBtn.parentNode.replaceChild(newBtn, testBtn);

    newBtn.addEventListener('click', () => {
        console.log("🔔 Prueba de sistema activada");
        const testAudio = new Audio('https://actions.google.com/sounds/v1/foley/door_bell.ogg');
        testAudio.play().catch(() => console.log("Se requiere interacción para audio"));
        flashElement('auprice', 'bg-emerald-500/40');
    });
}

// --- CARGA DE DATOS API ---

async function loadAndDisplayKpis() {
    try {
        const kpis = await fetchCycleKpis();
        if (!kpis) return;
        const avgVal = kpis.averageProfitPercentage || 0;
        updateElementText('cycle-avg-profit', 
            `${avgVal >= 0 ? '+' : ''}${avgVal.toFixed(2)}%`, 
            `text-sm font-bold ${avgVal >= 0 ? 'text-emerald-400' : 'text-red-500'}`
        );
        updateElementText('total-cycles-closed', kpis.totalCycles || 0);
    } catch (e) { console.error("Error cargando KPIs:", e); }
}

async function loadAndRenderEquityCurve() {
    try {
        const curveData = await fetchEquityCurveData();
        if (curveData?.length > 0) {
            cycleHistoryData = curveData;
            renderEquityCurve(cycleHistoryData, currentChartParameter);
        }
    } catch (e) { console.error("Error cargando gráfico:", e); }
}

// --- UTILIDADES DE INTERFAZ ---

function updateHealthStatus(textId, isOnline) {
    const txt = document.getElementById(textId);
    if (txt) {
        txt.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
        txt.className = `text-[9px] font-mono font-bold ${isOnline ? 'text-emerald-500' : 'text-red-400'}`;
    }
}

function flashElement(id, colorClass) {
    const el = document.getElementById(id);
    if (el) {
        const container = el.parentElement;
        container.classList.add(colorClass);
        setTimeout(() => container.classList.remove(colorClass), 800);
    }
}

function updateElementText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}