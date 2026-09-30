/**
 * socket.js - Communication Layer (Full Sync 2026)
 * Versión: BSB 2026 - Soporte Multiusuario y Salas Privadas
 * Actualización: Blindaje contra parpadeos, fusión profunda de IA y soporte nativo para ceros.
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
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        timeout: 45000,
        auth: { token },      
        query: { userId }     
    });

    socket.onAny((event, ...args) => {
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

    // --- MARKET DATA (BLINDADA CONTRA RE-RENDERIZADOS INNECESARIOS) ---
    socket.on('marketData', async (data) => {
        resetWatchdog();
        
        const rawPrice = parseFloat(data?.price);
        
        if (!isNaN(rawPrice)) {
            currentBotState.price = rawPrice;
            
            const priceEl = document.getElementById('auprice');
            if (priceEl) {
                formatCurrency(priceEl, rawPrice, currentBotState.lastPrice || 0);
                currentBotState.lastPrice = rawPrice;
            }

            // 🛡️ BLINDAJE: Solo actualizamos la IA si el tick de mercado trae un 'aiPulse' explícito.
            // Esto evita que los ticks de precio ultrarrápidos limpien los indicadores técnicos.
            if (data.aiPulse) {
                currentBotState.aiLastPulse = { 
                    ...(currentBotState.aiLastPulse || {}), 
                    ...data.aiPulse 
                };
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
        
    // 🧠 LISTENER UNIFICADO PARA EL PULSO NEURAL
    socket.on('ai-pulse-broadcast', (data) => {
        if (!data) return;
        
        // Fusión profunda para conservar datos anteriores intactos
        currentBotState.aiLastPulse = { 
            ...(currentBotState.aiLastPulse || {}), 
            ...data 
        };

        if (data.aiprofit !== undefined) {
            updatePnLBar('ai', data.aiprofit);
        }

        renderAiPulseUI(currentBotState.aiLastPulse); 
    });

    // --- GLOBAL BOT STATE (SHIELDED) ---
    socket.on('bot-state-update', async (rawState) => {
        if (!rawState) return;

        const sanitizeState = (s) => {
            if (!s.config) return s;
            ['long', 'short', 'ai'].forEach(side => {
                if (s.config[side]) {
                    s.config[side].size_var = isNaN(parseFloat(s.config[side].size_var)) ? 1 : parseFloat(s.config[side].size_var);
                    s.config[side].price_var = isNaN(parseFloat(s.config[side].price_var)) ? 0.1 : parseFloat(s.config[side].price_var);
                    s.config[side].amountUsdt = isNaN(parseFloat(s.config[side].amountUsdt)) ? 6.0 : parseFloat(s.config[side].amountUsdt);
                }
            });
            return s;
        };

        const state = sanitizeState(rawState);

        const now = Date.now();
        const isEditing = activeEdits && typeof activeEdits === 'object' 
            ? Object.values(activeEdits).some(timestamp => (now - timestamp) < 2000)
            : false;

        if (!isEditing) {
            if (state.config) {
                if (!currentBotState.config) currentBotState.config = {};
                
                ['long', 'short', 'ai'].forEach(side => {
                    if (state.config[side]) {
                        currentBotState.config[side] = { 
                            ...currentBotState.config[side], 
                            ...state.config[side] 
                        };
                    }
                });
            }
            
            Object.keys(state).forEach(key => {
                if (key !== 'config') currentBotState[key] = state[key];
            });
            
            updateBotUI(currentBotState);
        }

        if (state.history || state.cycleHistory) {
            try {
                const Metrics = await import('./metricsManager.js');
                Metrics.processStateUpdate(state); 
            } catch (err) { 
                console.error("Error delegando métricas:", err); 
            }
        }

        const aiIsActive = (state.aistate === 'RUNNING' || state.isRunning === true);
        currentBotState.isRunning = aiIsActive;

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
 * Renderiza de forma atómica y segura las variables y componentes de la IA en el DOM
 */
function renderAiPulseUI(aiData) {
    if (!aiData) return;

    // Helper robusto: Extrae números válidos admitiendo el '0' real y descartando NaN/undefined
    const parseNum = (val, fallback = 0) => {
        if (val === undefined || val === null || val === '') return fallback;
        const num = parseFloat(val);
        return !isNaN(num) ? num : fallback;
    };

    const confidence = parseNum(aiData.aiConfidence ?? aiData.confidence, 0);
    const adx = parseNum(aiData.aiAdx ?? aiData.adx, 0);
    const stochK = parseNum(aiData.stochK ?? aiData.aiStochK ?? aiData.aiStoch, 0);
    const stochD = parseNum(aiData.stochD ?? aiData.aiStochD, 0);
    const rsi = parseNum(aiData.rsi14 ?? aiData.currentRsi ?? aiData.aiRsi, 0);

    // Perímetros específicos de cada SVG
    const targets = [
        { circle: document.getElementById('ai-confidence-circle-dashboard'), text: document.getElementById('ai-confidence-value-dashboard'), perimeter: 364.42 },
        { circle: document.getElementById('ai-confidence-circle-aibot'), text: document.getElementById('ai-confidence-value-aibot'), perimeter: 364.4 }
    ];

    targets.forEach(target => {
        if (target.circle) {
            const boundedConf = Math.min(Math.max(confidence, 0), 100);
            const offset = target.perimeter - (boundedConf / 100) * target.perimeter;
            target.circle.style.strokeDashoffset = offset;
            target.circle.style.strokeDasharray = `${target.perimeter}`;
        }
        if (target.text) {
            target.text.innerText = `${Math.round(confidence)}%`;
        }
    });
    
    // Mapeo seguro de elementos del DOM
    const elements = {
        adxVal: document.getElementById('ai-adx-val'),
        adxBar: document.getElementById('ai-adx-bar'),
        stochVal: document.getElementById('ai-stoch-val'),
        stochBar: document.getElementById('ai-stoch-bar'),
        rsiVal: document.getElementById('ai-rsi-val'), 
        rsiBar: document.getElementById('ai-rsi-bar')
    };

    if (elements.adxVal) elements.adxVal.innerText = adx.toFixed(1);
    if (elements.adxBar) elements.adxBar.style.width = `${Math.min(adx, 100)}%`;
    
    if (elements.stochVal) elements.stochVal.innerText = `${stochK.toFixed(1)} / ${stochD.toFixed(1)}`;
    if (elements.stochBar) elements.stochBar.style.width = `${Math.min(stochK, 100)}%`;
    
    if (elements.rsiVal) elements.rsiVal.innerText = rsi.toFixed(1);
    if (elements.rsiBar) elements.rsiBar.style.width = `${Math.min(rsi, 100)}%`;
}