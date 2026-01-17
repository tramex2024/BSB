// public/js/modules/dashboard.js

import { fetchEquityCurveData, fetchCycleKpis } from './apiService.js'; 
import { renderEquityCurve } from './chart.js';
import { socket } from '../main.js'; 
import { updateBotUI } from './uiManager.js';

let cycleHistoryData = []; 
let currentChartParameter = 'accumulatedProfit'; 

const sounds = {
    buy: new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'),
    sell: new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'),
};
Object.values(sounds).forEach(s => s.volume = 0.4);

/**
 * Inicialización principal del Dashboard
 * @param {Object} initialState - Recibe la memoria central desde main.js
 */
export function initializeDashboardView(initialState) {
    // 1. SINCRONIZACIÓN INICIAL
    // Pintamos lo que ya sabemos antes de esperar al siguiente tic del socket
    if (initialState) {
        updateBotUI(initialState);
    }

    // 2. LIMPIEZA SELECTIVA (No apagues los eventos globales del main.js)
    if (socket) {
        // Solo apagamos eventos específicos de ESTA pestaña para no duplicarlos
        socket.off('market-signal-update');
        socket.off('order-executed');
        socket.off('cycle-closed');
        socket.off('ai-decision-update');
    }

    // 3. ACTIVAR COMPONENTES
    setupSocketListeners();
    setupChartSelector();
    setupTestButton(); 
    
    // 4. CARGA DE DATOS PESADOS
    loadAndRenderEquityCurve();
    loadAndDisplayKpis();

    // Refresco de salud visual inmediato
    updateHealthStatus('health-market-ws', 'health-market-ws-text', socket?.connected);
}

/**
 * Gestión de Sockets Específicos del Dashboard
 */
function setupSocketListeners() {
    if (!socket) return;

    // NOTA: No re-pongas socket.on('bot-state-update') aquí, 
    // porque el main.js ya lo está manejando globalmente.

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

    // Notificaciones de Ejecución + Sonidos
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

    // Fin de Ciclo
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
        if (progressEl) progressEl.style.strokeDasharray = `${confidenceVal}, 100`;

        updateElementText('ai-mini-thought', data.message);

        const actionEl = document.getElementById('ai-mini-action');
        if (actionEl) {
            const isHigh = confidenceVal > 80;
            actionEl.textContent = isHigh ? "ALTA PROBABILIDAD" : "ANALIZANDO PATRONES";
            actionEl.className = `text-[9px] font-bold mt-1 uppercase ${isHigh ? 'text-emerald-400' : 'text-blue-400'}`;
        }
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