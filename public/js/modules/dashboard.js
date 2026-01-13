// public/js/modules/dashboard.js

import { fetchEquityCurveData, fetchCycleKpis } from './apiService.js'; 
import { renderEquityCurve } from './chart.js';
import { socket } from '../main.js'; 
import { updateBotUI } from './uiManager.js'; // Importante para cargar el precio

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
export function initializeDashboardView() {
    // 1. LIMPIEZA CRÍTICA DE SOCKETS
    if (socket) {
        socket.off('bot-state-update'); // Escuchar estado para el precio
        socket.off('marketData');
        socket.off('open-orders-update');
        socket.off('market-signal-update');
        socket.off('order-executed');
        socket.off('cycle-closed');
        socket.off('ai-decision-update');
        socket.off('disconnect');
    }

    // 2. ACTIVAR COMPONENTES
    setupSocketListeners();
    setupChartSelector();
    setupTestButton(); 
    
    // 3. CARGA DE DATOS (API + SOCKET INITIAL EMIT)
    loadAndRenderEquityCurve();
    loadAndDisplayKpis();

    if (socket && socket.connected) {
        socket.emit('get-bot-state'); // Pedimos el precio y estado actual inmediatamente
    }
}

/**
 * Configura el botón de prueba de notificaciones
 */
function setupTestButton() {
    const testBtn = document.getElementById('test-notification-btn');
    if (!testBtn) return;

    const newBtn = testBtn.cloneNode(true);
    testBtn.parentNode.replaceChild(newBtn, testBtn);

    newBtn.addEventListener('click', () => {
        console.log("🔔 Iniciando prueba de alerta...");
        const testAudio = new Audio('https://actions.google.com/sounds/v1/foley/door_bell.ogg');
        testAudio.volume = 0.8;
        testAudio.play()
            .catch(() => alert("Por favor, interactúa con la pantalla primero para habilitar el sonido."));

        flashElement('auprice', 'bg-emerald-500/40');
    });
}

/**
 * Gestión de Sockets
 */
function setupSocketListeners() {
    if (!socket) return;

    // Actualización de estado global (Precio BTC, balances, etc.)
    socket.on('bot-state-update', (state) => {
        updateBotUI(state);
    });

    // Salud del WebSocket de Mercado
    socket.on('marketData', () => {
        updateHealthStatus('health-market-ws', 'health-market-ws-text', true);
    });

    // Salud de Órdenes Privadas
    socket.on('open-orders-update', () => {
        updateHealthStatus('health-user-ws', 'health-user-ws-text', true);
    });

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

    // Fin de Ciclo (Venta Total)
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
        if (progressEl) progressEl.style.strokeDashoffset = 100 - confidenceVal;

        updateElementText('ai-mini-thought', data.message);

        const actionEl = document.getElementById('ai-mini-action');
        if (actionEl) {
            const isHigh = confidenceVal > 80;
            actionEl.textContent = isHigh ? "ALTA PROBABILIDAD" : "ANALIZANDO PATRONES";
            actionEl.className = `text-[9px] font-bold mt-1 uppercase ${isHigh ? 'text-emerald-400' : 'text-blue-400'}`;
        }
    });

    socket.on('disconnect', () => {
        updateHealthStatus('health-market-ws', 'health-market-ws-text', false);
        updateHealthStatus('health-user-ws', 'health-user-ws-text', false);
    });
}

// --- CONFIGURACIÓN DEL GRÁFICO ---
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

// --- CARGA DE DATOS ---
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
    } catch (e) { console.error("Error KPIs:", e); }
}

async function loadAndRenderEquityCurve() {
    try {
        const curveData = await fetchEquityCurveData();
        if (curveData?.length > 0) {
            cycleHistoryData = curveData;
            renderEquityCurve(cycleHistoryData, currentChartParameter);
        }
    } catch (e) { console.error("Error Gráfico:", e); }
}

// --- FUNCIONES AUXILIARES DE UI ---
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
    if (el?.parentElement) {
        const parent = el.parentElement;
        parent.classList.remove('bg-emerald-500/20', 'bg-orange-500/20', 'bg-yellow-500/30', 'bg-emerald-500/40');
        parent.classList.add(colorClass);
        setTimeout(() => parent.classList.remove(colorClass), 1000);
    }
}

function updateElementText(id, text, className = null) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
        if (className) el.className = className;
    }
}