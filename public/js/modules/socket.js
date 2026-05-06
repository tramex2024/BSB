/**
 * socket.js - Communication Layer (Full Sync 2026)
 * Versión: BSB 2026 - Soporte Multiusuario y Optimización de Renderizado
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
        // Importación dinámica para no cargar dashboard.js si no es necesario
        const { addTerminalLog } = await import('./dashboard.js');
        addTerminalLog(msg, type);
    } catch (e) {
        // Falla silenciosa si el dashboard no está montado
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
        transports: ['websocket'], // Priorizamos websocket puro para trading
        reconnection: true,
        reconnectionAttempts: 10,
        auth: { token },      
        query: { userId }     
    });

    // --- CONNECTION LISTENERS ---
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

    // --- MARKET DATA (PRICE & VARIATION) ---
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

            // Sincronización de UI y widgets
            updateBotUI(currentBotState); 
            syncDashboardWidgets(currentBotState);
        }

        if (data?.priceChangePercent !== undefined) {
            updatePriceVariationUI(parseFloat(data.priceChangePercent));
        }
    });

    // --- GLOBAL BOT STATE (SHIELDED) ---
    socket.on('bot-state-update', async (state) => {
        if (!state) return;

        const now = Date.now();
        const isEditing = Object.values(activeEdits).some(timestamp => (now - timestamp) < 2000);

        if (isEditing) {
            // Mientras se edita, solo actualizamos datos no intrusivos (balances y estados de ejecución)
            currentBotState.lastAvailableUSDT = state.lastAvailableUSDT ?? currentBotState.lastAvailableUSDT;
            currentBotState.lastAvailableBTC = state.lastAvailableBTC ?? currentBotState.lastAvailableBTC;
            currentBotState.lstate = state.lstate ?? currentBotState.lstate;
            currentBotState.sstate = state.sstate ?? currentBotState.sstate;
        } else {
            // Sincronización total si el usuario no está tocando inputs
            if (state.config) {
                currentBotState.config = { ...currentBotState.config, ...state.config };
            }
            Object.assign(currentBotState, state);
            updateBotUI(currentBotState);
        }

        // Inyección de métricas si el historial viene en el estado
        const historyData = state.history || state.cycleHistory;
        if (historyData) {
            const Metrics = await import('./metricsManager.js');
            Metrics.setAnalyticsData(historyData);
        }

        syncDashboardWidgets(currentBotState);

        if (aiBotUI) {
            const aiIsActive = (state.aistate === 'RUNNING' || state.isRunning === true);
            aiBotUI.setRunningStatus(aiIsActive, currentBotState.config.ai?.stopAtCycle, state.historyCount || 0);
        }
    });

    // --- LOGS & AI UPDATES ---
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

    socket.on('ai-decision-update', (data) => {
        if (!data || !aiBotUI) return;
        aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
    });

    return socket;
}

/**
 * Sincroniza widgets externos (Donut chart de balance)
 */
async function syncDashboardWidgets(state) {
    if (document.getElementById('balanceDonutChart')) {
        const { updateDistributionWidget } = await import('./dashboard.js');
        updateDistributionWidget(state);
    }
}

/**
 * Actualiza visualmente el porcentaje de cambio 24h (UI)
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