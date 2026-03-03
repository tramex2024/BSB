/**
 * socket.js - Communication Layer (Full Sync 2026)
 * Versión: BSB 2026 - Soporte Multiusuario y Salas Privadas
 * Actualización: Integración de Variación de Precio 24h + PnL Bars Sync
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
 * Función auxiliar para enviar logs al Terminal del Dashboard
 */
async function sendToDashboardTerminal(msg, type) {
    const dashboardLogs = document.getElementById('dashboard-logs');
    if (dashboardLogs) {
        try {
            const { addTerminalLog } = await import('./dashboard.js');
            addTerminalLog(msg, type);
        } catch (e) {
            console.warn("Dashboard Terminal no disponible");
        }
    }
}

export function initSocket() {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');

    if (!token || !userId) {
        console.warn("⚠️ Socket: No active session detected.");
        return null;
    }

    if (socket && socket.connected) {
        return socket;
    }

    socket = io(BACKEND_URL, { 
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
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
        console.warn("❌ Socket: Disconnected from Backend");
        updateConnectionStatus('DISCONNECTED');
        sendToDashboardTerminal("Connection Lost with Server", "error");
        if (typeof updateSystemHealth === 'function') updateSystemHealth('offline');
    });

    socket.on('connect_error', (err) => {
        console.error("❌ Socket Connection Error:", err.message);
        if (err.message === "Authentication error") {
            logStatus("Session expired or invalid", "error");
        }
        if (typeof updateSystemHealth === 'function') updateSystemHealth('offline');
    });

// --- MARKET DATA (PRICE & VARIATION) ---
    socket.on('marketData', async (data) => {
        resetWatchdog();
        
        if (data?.price) {
            const newPrice = parseFloat(data.price);
            currentBotState.price = newPrice;
            
            // Solo actualizamos el precio visualmente aquí
            const priceEl = document.getElementById('auprice');
            if (priceEl) {
                formatCurrency(priceEl, newPrice, currentBotState.lastPrice || 0);
                currentBotState.lastPrice = newPrice;
            }

            // LANZAMOS EL MANAGER: Él se encarga de las barras de PnL y todo lo demás
            updateBotUI(currentBotState); 

            // Widget de Donut (Si existe)
            if (document.getElementById('balanceDonutChart')) {
                const { updateDistributionWidget } = await import('./dashboard.js');
                updateDistributionWidget(currentBotState);
            }
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
            console.log("🛡️ Socket: Active editing detected. Shielding inputs...");
            currentBotState.lastAvailableUSDT = state.lastAvailableUSDT || currentBotState.lastAvailableUSDT;
            currentBotState.lastAvailableBTC = state.lastAvailableBTC || currentBotState.lastAvailableBTC;
            currentBotState.lstate = state.lstate || currentBotState.lstate;
            currentBotState.sstate = state.sstate || currentBotState.sstate;
            currentBotState.aistate = state.aistate || currentBotState.aistate;
        } else {
            if (state.config) {
                currentBotState.config = { ...currentBotState.config, ...state.config };
            }
            // Sincronizamos el estado global
            Object.assign(currentBotState, state);
            
            // Forzamos la persistencia manual de PnL
            if (state.lprofit !== undefined) currentBotState.lprofit = state.lprofit;
            if (state.sprofit !== undefined) currentBotState.sprofit = state.sprofit;
            if (state.aiprofit !== undefined) currentBotState.aiprofit = state.aiprofit;
            
            // El manager actualiza la UI y las barras de PnL automáticamente
            updateBotUI(currentBotState);
        }

        const historyData = state.history || state.cycleHistory;
        if (historyData) {
            try {
                const Metrics = await import('./metricsManager.js');
                Metrics.setAnalyticsData(historyData);
            } catch (err) {
                console.error("Error injecting metrics:", err);
            }
        }

        const aiIsActive = (state.aistate === 'RUNNING' || state.isRunning === true);
        currentBotState.isRunning = aiIsActive;

        if (document.getElementById('balanceDonutChart')) {
            const { updateDistributionWidget } = await import('./dashboard.js');
            updateDistributionWidget(currentBotState);
        }

        if (aiBotUI) {
            aiBotUI.setRunningStatus(
                aiIsActive, 
                currentBotState.config.ai?.stopAtCycle, 
                state.historyCount || 0
            );
        }
    });

    // --- PRIVATE LOGS & DEBUG STREAM ---
    socket.on('bot-log', (data) => {
        if (!data?.message) return;
        const msg = data.message;
        const isDebug = msg.includes('[DEBUG]') || msg.includes('👁️');

        if (!isDebug) logStatus(msg, data.type || 'info');
        sendToDashboardTerminal(msg, data.type || 'info');

        const aiLogContainer = document.getElementById('ai-log-container');
        if (aiLogContainer) {
            if (aiLogContainer.innerText.includes("Establishing link")) aiLogContainer.innerHTML = '';
            const visualConf = isDebug ? 0.5 : (data.type === 'success' ? 0.9 : 0.5);
            aiBotUI.addLogEntry(msg, visualConf);
        }
    });

    // --- AI DECISIONS & ORDERS ---
    socket.on('ai-decision-update', (data) => {
        if (!data || !aiBotUI) return;
        aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        if (data.message && data.message.includes('ORDER')) {
            sendToDashboardTerminal(`AI Decision: ${data.message}`, 'warning');
        }
    });

    socket.on('open-orders-update', async (data) => {
        const now = Date.now();
        if (currentBotState._lastOrderFetch && (now - currentBotState._lastOrderFetch < 1000)) return;
        currentBotState._lastOrderFetch = now;

        const aiOrderList = document.getElementById('ai-order-list');
        if (aiOrderList) {
            const { fetchOrders } = await import('./orders.js');
            fetchOrders('ai', aiOrderList, true); 
        }

        const auOrderList = document.getElementById('au-order-list');
        if (auOrderList) {
            const activeTabBtn = document.querySelector('.autobot-tabs button.text-emerald-400');
            const currentStrategy = activeTabBtn ? (activeTabBtn.getAttribute('data-strategy') || 'all') : 'all';
            const { fetchOrders } = await import('./orders.js');
            fetchOrders(currentStrategy, auOrderList, true); 
        }
    });

    socket.on('ai-history-update', async (trades) => {
        const aiOrderList = document.getElementById('ai-order-list');
        if (aiOrderList) {
            const { fetchOrders } = await import('./orders.js');
            fetchOrders('ai', aiOrderList, true);
        }
        if (trades) {
            const Metrics = await import('./metricsManager.js');
            Metrics.setAnalyticsData(trades);
        }
    });

    return socket;
}

/**
 * Actualiza visualmente el porcentaje de cambio 24h
 */
function updatePriceVariationUI(percent) {
    const percentEl = document.getElementById('price-percent');
    const iconEl = document.getElementById('price-icon');
    const container = document.getElementById('price-change-container');
    
    if (!percentEl || !iconEl) return;

    const val = parseFloat(percent);
    percentEl.textContent = `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;

    const textClasses = ['text-emerald-500', 'text-red-500', 'text-gray-400'];
    [percentEl, iconEl, container].forEach(el => el?.classList.remove(...textClasses));

    if (val > 0) {
        iconEl.className = 'fas fa-caret-up mr-0.5 text-emerald-500';
        percentEl.classList.add('text-emerald-500');
    } else if (val < 0) {
        iconEl.className = 'fas fa-caret-down mr-0.5 text-red-500';
        percentEl.classList.add('text-red-500');
    } else {
        iconEl.className = 'fas fa-minus mr-0.5 text-gray-400';
        percentEl.classList.add('text-gray-400');
    }
}

function resetWatchdog() {
    updateConnectionStatus('CONNECTED');
    if (connectionWatchdog) clearTimeout(connectionWatchdog);
    connectionWatchdog = setTimeout(() => {
        updateConnectionStatus('DISCONNECTED');
        updateSystemHealth('offline');
    }, 15000);
}

/**
 * Actualiza la barra de PnL dinámica
 */
function updatePnLBar(id, pnlValue) {
    const bar = document.getElementById(`pnl-bar-${id}`);
    if (!bar) return;

    const pnl = parseFloat(pnlValue) || 0;
    
    // Rango de visualización (hasta 10% de PnL para el 50% de la barra)
    const limit = 10; 
    const size = Math.min(Math.abs(pnl) / limit * 50, 50);

    if (pnl >= 0) {
        bar.style.left = '50%';
        bar.style.width = `${size}%`;
        bar.className = 'absolute h-full transition-all duration-500 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]';
    } else {
        bar.style.left = `${50 - size}%`;
        bar.style.width = `${size}%`;
        bar.className = 'absolute h-full transition-all duration-500 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]';
    }
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