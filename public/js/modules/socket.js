
/**
 * socket.js - Communication Layer (Full Sync 2026)
 * Versión: BSB 2026 - Soporte Multiusuario y Corrección de Integridad de Datos
 */
import { BACKEND_URL, currentBotState, logStatus } from '../main.js';
import aiBotUI from './aiBotUI.js';
import { updateBotUI } from './uiManager.js'; 
import { formatCurrency } from './ui/formatters.js';
import { activeEdits } from './ui/controls.js'; 
import { updateSystemHealth } from './health.js';

export let socket = null;
let connectionWatchdog = null;

/**
 * Auxiliar para enviar logs al Terminal sin bloquear el flujo principal
 */
async function sendToDashboardTerminal(msg, type) {
    try {
        const { addTerminalLog } = await import('./dashboard.js');
        addTerminalLog(msg, type);
    } catch (e) {
        // Dashboard no disponible en este momento
    }
}

export function initSocket() {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');

    if (!token || !userId) {
        console.warn("⚠️ Socket: No active session detected.");
        return null;
    }

    if (socket?.connected) return socket;

    socket = io(BACKEND_URL, { 
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        auth: { token },      
        query: { userId }     
    });

    // --- EVENTOS DE CONEXIÓN ---
    socket.on('connect', () => {
        resetWatchdog();
        socket.emit('get-bot-state'); 
        console.log(`✅ Socket: Connected as User ${userId}`);
        sendToDashboardTerminal("System Connected: Ready", "success");
        if (typeof updateSystemHealth === 'function') updateSystemHealth('online');
    });

    socket.on('disconnect', () => {
        updateConnectionStatus('DISCONNECTED');
        sendToDashboardTerminal("Connection Lost with Server", "error");
        if (typeof updateSystemHealth === 'function') updateSystemHealth('offline');
    });

    // --- MARKET DATA (PRECIO Y VARIACIÓN) ---
    socket.on('marketData', async (data) => {
        resetWatchdog();
        
        if (data?.price) {
            const newPrice = parseFloat(data.price);
            currentBotState.price = newPrice;
            
            const priceEl = document.getElementById('auprice');
            if (priceEl) {
                formatCurrency(priceEl, newPrice, currentBotState.lastPrice || 0);
                currentBotState.lastPrice = newPrice;
            }

            updateBotUI(currentBotState); 
            syncDashboardWidgets(currentBotState);
        }

        if (data?.priceChangePercent !== undefined) {
            updatePriceVariationUI(parseFloat(data.priceChangePercent));
        }
    });

    // --- ESTADO GLOBAL DEL BOT (SINCRO MAESTRA) ---
    socket.on('bot-state-update', async (state) => {
        if (!state) return;

        const now = Date.now();
        const isEditing = Object.values(activeEdits).some(timestamp => (now - timestamp) < 2000);

        if (isEditing) {
            // Protección de inputs activos
            currentBotState.lastAvailableUSDT = state.lastAvailableUSDT ?? currentBotState.lastAvailableUSDT;
            currentBotState.lastAvailableBTC = state.lastAvailableBTC ?? currentBotState.lastAvailableBTC;
            currentBotState.lstate = state.lstate ?? currentBotState.lstate;
            currentBotState.sstate = state.sstate ?? currentBotState.sstate;
        } else {
            if (state.config) {
                currentBotState.config = { ...currentBotState.config, ...state.config };
            }
            Object.assign(currentBotState, state);
            updateBotUI(currentBotState);
        }

        // CORRECCIÓN DE CICLOS: Aseguramos que el historial sea reemplazado, no acumulado
        const historyData = state.history || state.cycleHistory;
        if (historyData) {
            try {
                const Metrics = await import('./metricsManager.js');
                Metrics.setAnalyticsData(historyData); // Esto debe resetear el contador a 29
            } catch (err) {
                console.error("Error inyectando métricas:", err);
            }
        }

        syncDashboardWidgets(currentBotState);

        if (aiBotUI) {
            const aiIsActive = (state.aistate === 'RUNNING' || state.isRunning === true);
            aiBotUI.setRunningStatus(aiIsActive, currentBotState.config.ai?.stopAtCycle, state.historyCount || 0);
        }
    });

    // --- LOGS Y DEBUG ---
    socket.on('bot-log', (data) => {
        if (!data?.message) return;
        const msg = data.message;
        const isDebug = msg.includes('[DEBUG]') || msg.includes('👁️');

        if (!isDebug) logStatus(msg, data.type || 'info');
        sendToDashboardTerminal(msg, data.type || 'info');

        if (aiBotUI && document.getElementById('ai-log-container')) {
            aiBotUI.addLogEntry(msg, isDebug ? 0.5 : 0.9);
        }
    });

    // --- ACTUALIZACIÓN DE ÓRDENES Y DECISIONES IA ---
    socket.on('ai-decision-update', (data) => {
        if (!data || !aiBotUI) return;
        aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        if (data.message?.includes('ORDER')) {
            sendToDashboardTerminal(`AI Decision: ${data.message}`, 'warning');
        }
    });

    socket.on('open-orders-update', async () => {
        const { fetchOrders } = await import('./orders.js');
        // Actualizar listas si los contenedores existen
        const aiList = document.getElementById('ai-order-list');
        if (aiList) fetchOrders('ai', aiList, true);
        
        const auList = document.getElementById('au-order-list');
        if (auList) fetchOrders('all', auList, true);
    });

    socket.on('ai-history-update', async (trades) => {
        if (trades) {
            const Metrics = await import('./metricsManager.js');
            Metrics.setAnalyticsData(trades);
        }
    });

    return socket;
}

/**
 * Sincroniza widgets visuales del dashboard
 */
async function syncDashboardWidgets(state) {
    if (document.getElementById('balanceDonutChart')) {
        const { updateDistributionWidget } = await import('./dashboard.js');
        updateDistributionWidget(state);
    }
}

/**
 * UI para Variación de Precio 24h
 */
function updatePriceVariationUI(percent) {
    const percentEl = document.getElementById('price-percent');
    const iconEl = document.getElementById('price-icon');
    if (!percentEl || !iconEl) return;

    const val = parseFloat(percent);
    percentEl.textContent = `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;

    const colorClass = val > 0 ? 'text-emerald-500' : (val < 0 ? 'text-red-500' : 'text-gray-400');
    const iconClass = val > 0 ? 'fa-caret-up' : (val < 0 ? 'fa-caret-down' : 'fa-minus');

    percentEl.className = `font-bold ${colorClass}`;
    iconEl.className = `fas ${iconClass} mr-1 ${colorClass}`;
}

function resetWatchdog() {
    updateConnectionStatus('CONNECTED');
    if (connectionWatchdog) clearTimeout(connectionWatchdog);
    connectionWatchdog = setTimeout(() => {
        updateConnectionStatus('DISCONNECTED');
        if (typeof updateSystemHealth === 'function') updateSystemHealth('offline');
    }, 15000);
}

function updateConnectionStatus(status) {
    const statusDot = document.getElementById('status-dot');
    if (statusDot) {
        const isConnected = status === 'CONNECTED';
        statusDot.className = `w-3 h-3 rounded-full transition-all duration-500 ${
            isConnected ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]'
        }`;
    }
}