/**
 * socket.js - Communication Layer (Full Sync 2026)
 * Versión: BSB 2026 - Soporte Multiusuario y Salas Privadas
 * Actualización: Consolidación de Emisiones de Pulso + Blindaje de Inputs
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
    reconnectionAttempts: 10, // Aumentado para insistir mientras Render despierta
    reconnectionDelay: 2000,   // Espera 2 segundos entre intentos
    timeout: 45000,            // ⏱️ CRÍTICO: Le damos 45 segundos de margen al handshake
    auth: { token },      
    query: { userId }     
});

    socket.onAny((event, ...args) => {
        // En producción se mantiene apagado para optimizar rendimiento de red
        // console.log(`📡 SOCKET EVENTO: [${event}]`, args);
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

    // --- MARKET DATA (PRICE, VARIATION & REALTIME AI PULSE) ---
    socket.on('marketData', async (data) => {
        resetWatchdog();
        
        if (!data?.aiPulse) {
            console.warn("⚠️ [DEBUG] Backend envió marketData sin aiPulse. Datos recibidos:", data);
        }

        if (data?.price) {
            const newPrice = parseFloat(data.price);
            currentBotState.price = newPrice;
            
            const priceEl = document.getElementById('auprice');
            if (priceEl) {
                formatCurrency(priceEl, newPrice, currentBotState.lastPrice || 0);
                currentBotState.lastPrice = newPrice;
            }

            // Efecto Memoria / Persistencia del Pulso Neural
            if (data.aiPulse) {
                currentBotState.aiLastPulse = data.aiPulse;
                renderAiPulseUI(data.aiPulse);
            } else if (currentBotState.aiLastPulse) {
                renderAiPulseUI(currentBotState.aiLastPulse);
            }

            updateBotUI(currentBotState); 

            if (document.getElementById('balanceDonutChart')) {
                const { updateDistributionWidget } = await import('./dashboard.js');
                updateDistributionWidget(currentBotState);
            }
        }

        if (data?.priceChangePercent !== undefined) {
            updatePriceVariationUI(parseFloat(data.priceChangePercent));
        }
    });
        
    // 🧠 LISTENER UNIFICADO PARA EL PULSO NEURAL (Soporte Aislado y Persistencia)
    socket.on('ai-pulse-broadcast', (data) => {
        if (!data) return;
        
        currentBotState.aiLastPulse = data;

        // Sincronización automática de PnL de la IA
        if (data.aiprofit !== undefined) {
            updatePnLBar('ai', data.aiprofit);
        }

        // Delegación atómica al renderizador del DOM (Evita duplicados)
        renderAiPulseUI(data); 
    });

    // --- GLOBAL BOT STATE (SHIELDED) ---
    socket.on('bot-state-update', async (state) => {
        if (!state) return;

        // Auditoría e inyección inmediata de flujos de IA
        if (state.aiPulse || state.aiLastPulse) {
            const pulseData = state.aiPulse || state.aiLastPulse;
            currentBotState.aiLastPulse = pulseData;
            renderAiPulseUI(pulseData);
        }

        // Mecanismo de blindaje contra sobreescritura (User Typing Shield)
        const now = Date.now();
        const isEditing = activeEdits && typeof activeEdits === 'object' 
            ? Object.values(activeEdits).some(timestamp => (now - timestamp) < 2000)
            : false;

        if (isEditing) {
            console.log("🛡️ Socket: Active editing detected. Shielding inputs...");
            currentBotState.lastAvailableUSDT = state.lastAvailableUSDT || currentBotState.lastAvailableUSDT;
            currentBotState.lastAvailableBTC = state.lastAvailableBTC || currentBotState.lastAvailableBTC;
        } else {
            if (state.config) {
                currentBotState.config = { ...currentBotState.config, ...state.config };
            }
            Object.assign(currentBotState, state);
            
            if (state.lprofit !== undefined) currentBotState.lprofit = state.lprofit;
            if (state.sprofit !== undefined) currentBotState.sprofit = state.sprofit;
            if (state.aiprofit !== undefined) currentBotState.aiprofit = state.aiprofit;
            
            updateBotUI(currentBotState);
        }

        // Sincronización dinámica de métricas avanzadas e historial de ciclos
        const historyData = state.history || state.cycleHistory;
        if (historyData) {
            try {
                const Metrics = await import('./metricsManager.js');
                const { updateQuickStats } = await import('./dashboard.js');
                
                Metrics.setAnalyticsData(historyData);
                
                if (state.kpis) {
                    updateQuickStats(state.kpis);
                }
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

        if (aiBotUI && typeof aiBotUI.setRunningStatus === 'function') {
            aiBotUI.setRunningStatus(
                aiIsActive, 
                currentBotState.config?.ai?.stopAtCycle, 
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
            if (aiBotUI && typeof aiBotUI.addLogEntry === 'function') {
                aiBotUI.addLogEntry(msg, visualConf);
            }
        }
    });

    // --- AI DECISIONS & ORDERS ---
    socket.on('ai-decision-update', (data) => {
        if (!data || !aiBotUI) return;
        if (typeof aiBotUI.updateConfidence === 'function') {
            aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        }
        if (data.message && data.message.includes('ORDER')) {
            sendToDashboardTerminal(`AI Decision: ${data.message}`, 'warning');
        }
    });

    // --- ORDER FLUX REFRESH ---
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
 * Actualiza la barra de PnL dinámica centrándola en el 50%
 */
function updatePnLBar(id, pnlValue) {
    const bar = document.getElementById(`pnl-bar-${id}`);
    if (!bar) return;

    const pnl = parseFloat(pnlValue) || 0;
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

/**
 * Renderiza de forma atómica las variables y componentes de la IA en el DOM
 */
function renderAiPulseUI(aiData) {
    const dbCircle = document.getElementById('ai-confidence-circle');
    if (!dbCircle) return;

    const confidence = aiData.aiConfidence || 0;
    const perimeter = 364.42;
    const offset = perimeter - (confidence / 100) * perimeter;
    dbCircle.style.strokeDashoffset = offset;
    
    const elements = {
        confVal: document.getElementById('ai-confidence-value'),
        trendLabel: document.getElementById('ai-trend-label'),
        adxVal: document.getElementById('ai-adx-val'),
        adxBar: document.getElementById('ai-adx-bar'),
        stochVal: document.getElementById('ai-stoch-val'),
        stochBar: document.getElementById('ai-stoch-bar'),
        rsiVal: document.getElementById('ai-rsi-val'), 
        rsiBar: document.getElementById('ai-rsi-bar'), 
        engineMsg: document.getElementById('ai-engine-msg')
    };

    if (elements.confVal) elements.confVal.innerText = `${confidence}%`;
    if (elements.trendLabel) elements.trendLabel.innerText = aiData.aiTrendLabel || 'N/A';
    
    if (elements.adxVal) elements.adxVal.innerText = Number(aiData.aiAdx || 0).toFixed(1);
    if (elements.adxBar) elements.adxBar.style.width = `${Math.min(aiData.aiAdx || 0, 100)}%`;
    
    if (elements.stochVal) elements.stochVal.innerText = Number(aiData.aiStoch || 0).toFixed(1);
    if (elements.stochBar) elements.stochBar.style.width = `${Math.min(aiData.aiStoch || 0, 100)}%`;
    
    if (elements.rsiVal) elements.rsiVal.innerText = Number(aiData.aiRsi || 0).toFixed(1);
    if (elements.rsiBar) elements.rsiBar.style.width = `${Math.min(aiData.aiRsi || 0, 100)}%`;

    if (elements.engineMsg) elements.engineMsg.innerText = aiData.aiEngineMsg || 'Waiting...';
}