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

// Añade este listener global para ver todo el tráfico entrante
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

    // MUEVE EL LISTENER AQUÍ, JUSTO DESPUÉS DE LA INICIALIZACIÓN
    socket.onAny((event, ...args) => {
        console.log(`📡 SOCKET EVENTO RECIBIDO: [${event}]`, args);
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
        
        if (data?.price) {
            const newPrice = parseFloat(data.price);
            currentBotState.price = newPrice;
            
            // Solo actualizamos el precio visualmente aquí
            const priceEl = document.getElementById('auprice');
            if (priceEl) {
                formatCurrency(priceEl, newPrice, currentBotState.lastPrice || 0);
                currentBotState.lastPrice = newPrice;
            }

            // --- PERSISTENCIA Y RENDERIZADO INMEDIATO DE LA IA ---
            // Si el tick contiene el pulso neural del backend, lo salvamos en el estado de memoria global
            /*if (data.aiPulse) {
                currentBotState.aiLastPulse = data.aiPulse;
                renderAiPulseUI(data.aiPulse);
            } else if (currentBotState.aiLastPulse) {
                // EFECTO MEMORIA AL NAVEGAR: Si regresamos de otra pestaña y el tick actual no trae datos, 
                // forzamos el renderizado usando la memoria caché global.
                renderAiPulseUI(currentBotState.aiLastPulse);
            }*/

	    if (data.aiPulse) {
            currentBotState.aiLastPulse = data.aiPulse;
            renderAiPulseUI(data.aiPulse);
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

    // Mantén este listener para conservar la compatibilidad si el motor neural emite de forma aislada
    socket.on('ai-pulse-broadcast', (data) => {
        console.log("🚀 AUDITORÍA: Recibido ai-pulse-broadcast ->", data);

	if (!data) return;
        currentBotState.aiLastPulse = data;
        renderAiPulseUI(data);
    });

    // --- GLOBAL BOT STATE (SHIELDED) ---
    socket.on('bot-state-update', async (state) => {
        if (!state) return;

        const now = Date.now();
        const isEditing = Object.values(activeEdits).some(timestamp => (now - timestamp) < 2000);

        if (isEditing) {
            console.log("🛡️ Socket: Active editing detected. Shielding...");
            currentBotState.lastAvailableUSDT = state.lastAvailableUSDT || currentBotState.lastAvailableUSDT;
            currentBotState.lastAvailableBTC = state.lastAvailableBTC || currentBotState.lastAvailableBTC;
        } else {
            if (state.config) {
                currentBotState.config = { ...currentBotState.config, ...state.config };
            }
            Object.assign(currentBotState, state);
            
            // Sincronización de PnL Individual
            if (state.lprofit !== undefined) currentBotState.lprofit = state.lprofit;
            if (state.sprofit !== undefined) currentBotState.sprofit = state.sprofit;
            if (state.aiprofit !== undefined) currentBotState.aiprofit = state.aiprofit;
            
            updateBotUI(currentBotState);
        }

        // 🚀 MEJORA CRÍTICA: Sincronización de Métricas y Profit/H en vivo
        const historyData = state.history || state.cycleHistory;
        if (historyData) {
            try {
                const Metrics = await import('./metricsManager.js');
                const { updateQuickStats } = await import('./dashboard.js'); // Importamos la función de KPIs
                
                // 1. Actualizamos el set de datos en el manager (los 29+ ciclos)
                Metrics.setAnalyticsData(historyData);
                
                // 2. Si el backend envió KPIs pre-calculados, actualizamos Profit/H
                if (state.kpis) {
                    updateQuickStats(state.kpis);
                } else {
                    console.log("🔄 Socket: New history detected, triggering KPI refresh...");
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

    // 🧠 ADENTRO DE LA FUNCIÓN: Sincronización en tiempo real del Pulso Neural
    socket.on('ai-pulse-broadcast', (data) => {
        if (!data) return;

        // RESPALDO CRÍTICO: Guardamos el estado en la memoria global para que no se pierda al navegar
        currentBotState.aiLastPulse = data;

        // 1. ACTUALIZACIÓN DINÁMICA DE LA BARRA PnL DE LA IA
        // Si el backend envía el aiprofit calculado, actualizamos la barra visualmente
        if (data.aiprofit !== undefined) {
            updatePnLBar('ai', data.aiprofit);
        }

        // 2. Buscamos el círculo e indicadores del Dashboard si están montados en el DOM
        const dbCircle = document.getElementById('ai-confidence-circle');
        if (dbCircle) {
            const confidence = data.aiConfidence;
            const perimeter = 364.42;
            const offset = perimeter - (confidence / 100) * perimeter;
            
            // Renderizado instantáneo del SVG sin lags de base de datos
            dbCircle.style.strokeDashoffset = offset;
            
            // Actualización de textos e indicadores del Pulse en el Dashboard
            const confVal = document.getElementById('ai-confidence-value');
            const trendLabel = document.getElementById('ai-trend-label');
            const adxVal = document.getElementById('ai-adx-val');
            const stochVal = document.getElementById('ai-stoch-val');
            const adxBar = document.getElementById('ai-adx-bar');
            const stochBar = document.getElementById('ai-stoch-bar');
            const engineMsg = document.getElementById('ai-engine-msg');

            if (confVal) confVal.innerText = `${confidence}%`;
            if (trendLabel) trendLabel.innerText = data.aiTrendLabel;
            if (adxVal) adxVal.innerText = Number(data.aiAdx).toFixed(1);
            if (stochVal) stochVal.innerText = Number(data.aiStoch).toFixed(1);
            if (adxBar) adxBar.style.width = `${Math.min(data.aiAdx, 100)}%`;
            if (stochBar) stochBar.style.width = `${Math.min(data.aiStoch, 100)}%`;
            if (engineMsg) engineMsg.innerText = data.aiEngineMsg;
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

/**
 * Renderiza de forma atómica las variables y componentes de la IA en el DOM
 */
function renderAiPulseUI(aiData) {
    const dbCircle = document.getElementById('ai-confidence-circle');
    if (!dbCircle) return; // Si el usuario está en otra vista que no tiene el widget, salimos elegantemente

    const confidence = aiData.aiConfidence;
    const perimeter = 364.42;
    const offset = perimeter - (confidence / 100) * perimeter;
    
    // Sincronización vectorial sin latencia
    dbCircle.style.strokeDashoffset = offset;
    
    const confVal = document.getElementById('ai-confidence-value');
    const trendLabel = document.getElementById('ai-trend-label');
    const adxVal = document.getElementById('ai-adx-val');
    const stochVal = document.getElementById('ai-stoch-val');
    const adxBar = document.getElementById('ai-adx-bar');
    const stochBar = document.getElementById('ai-stoch-bar');
    const engineMsg = document.getElementById('ai-engine-msg');

    if (confVal) confVal.innerText = `${confidence}%`;
    if (trendLabel) trendLabel.innerText = aiData.aiTrendLabel;
    if (adxVal) adxVal.innerText = Number(aiData.aiAdx).toFixed(1);
    if (stochVal) stochVal.innerText = Number(aiData.aiStoch).toFixed(1);
    if (adxBar) adxBar.style.width = `${Math.min(aiData.aiAdx, 100)}%`;
    if (stochBar) stochBar.style.width = `${Math.min(aiData.aiStoch, 100)}%`;
    if (engineMsg) engineMsg.innerText = aiData.aiEngineMsg;
}