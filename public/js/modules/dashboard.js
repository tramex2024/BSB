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

    // 1. Aplicar estado inicial inmediatamente (Evita el $0.00 al entrar)
    if (initialState) {
        updateBotUI(initialState);
    }

    // 2. Limpieza de listeners previos para evitar duplicidad
    if (socket) {
        socket.off('market-signal-update');
        socket.off('order-executed');
        socket.off('cycle-closed');
        socket.off('ai-decision-update');
    }

    // 3. Activar componentes de la interfaz
    setupSocketListeners();
    setupChartSelector();
    setupTestButton(); 
    
    // 4. Carga de datos externos (Gráficos y KPIs)
    loadAndRenderEquityCurve();
    loadAndDisplayKpis();

    // 5. Forzar actualización de salud visual
    updateHealthStatus('health-market-ws', 'health-market-ws-text', socket?.connected);
}

/**
 * Gestión de Sockets (Específicos para feedback visual del Dashboard)
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

    // Notificaciones de Ejecución (Sonidos + Flashing)
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
    
    // Escuchar el latido del bot (State Update)
    socket.on('bot-state-update', (fullState) => {
    console.log("🔄 Update recibido:", fullState);
    updateBotUI(fullState); // Aquí es donde ocurre la magia
    });
 
    // Evento de cierre de ciclo
    socket.on('cycle-closed', () => {
        sounds.sell.play().catch(() => {});
        flashElement('auprofit', 'bg-yellow-500/30');
        loadAndRenderEquityCurve();
        loadAndDisplayKpis();
    });

    // Mini-Widget de IA (Monitor Neural)
    socket.on('ai-decision-update', (data) => {
        const confidenceVal = Math.round(data.confidence * 100);
        updateElementText('ai-mini-confidence', `${confidenceVal}%`);
        
        const progressEl = document.getElementById('ai-mini-progress');
        if (progressEl) {
            // Ajuste del círculo de progreso SVG
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
 * Botón de prueba para verificar sonidos y efectos visuales
 */
function setupTestButton() {
    const testBtn = document.getElementById('test-notification-btn');
    if (!testBtn) return;

    // Clonación para limpiar eventos previos
    const newBtn = testBtn.cloneNode(true);
    testBtn.parentNode.replaceChild(newBtn, testBtn);

    newBtn.addEventListener('click', () => {
        console.log("🔔 Prueba de sistema activada");
        const testAudio = new Audio('https://actions.google.com/sounds/v1/foley/door_bell.ogg');
        testAudio.play().catch(() => console.log("Se requiere interacción para audio"));
        flashElement('auprice', 'bg-emerald-500/40');
    });
}

// --- FUNCIONES DE CARGA DE DATOS (API) ---

async function loadAndDisplayKpis() {
    try {
        const kpis = await fetchCycleKpis();
        if (!kpis) return;
        const avgVal = kpis.averageProfitPercentage || 0;
        updateElementText('cycle-avg-profit', 
            `${avgVal >= 0 ? '+' : ''}${avgVal.toFixed(2)}%`, 
            `text-xl font-bold ${avgVal >= 0 ? 'text-yellow-500' : 'text-red-500'}`
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

// Inicialización del Donut Chart de Balance
const ctxBalance = document.getElementById('balanceDonutChart').getContext('2d');
const balanceChart = new Chart(ctxBalance, {
    type: 'doughnut',
    data: {
        datasets: [{
            data: [50, 50], // Valores iniciales
            backgroundColor: ['#10b981', '#f59e0b'], // Esmeralda para USDT, Naranja para BTC
            borderWidth: 0,
            cutout: '80%'
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
    }
});

// --- UTILIDADES DE INTERFAZ ---

function updateHealthStatus(dotId, textId, isOnline) {
    const dot = document.getElementById(dotId);
    const txt = document.getElementById(textId);
    if (dot && txt) {
        dot.className = `w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`;
        txt.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
        txt.className = `text-[9px] font-mono ${isOnline ? 'text-emerald-500' : 'text-red-500'}`;
    }
}

function flashElement(id, colorClass) {
    const el = document.getElementById(id);
    if (el) {
        // Buscamos el contenedor visual más cercano para aplicar el brillo
        const container = el.closest('.bg-gray-700\\/50') || el.parentElement;
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