/**
 * socket.js - Communication Layer (Full Sync 2026)
 * Versión: BSB 2026 - Soporte Multiusuario y Salas Privadas
 * Actualización: Auditoría Anti-Parpadeo e Integración de Métricas (RESTAURADO)
 */
import { BACKEND_URL, currentBotState, logStatus } from '../main.js';
import aiBotUI from './aiBotUI.js';
import { updateBotUI } from './uiManager.js'; 
import { formatCurrency } from './ui/formatters.js';

export let socket = null;
let connectionWatchdog = null;

/**
 * Función auxiliar para enviar logs al Terminal del Dashboard si existe
 */
async function sendToDashboardTerminal(msg, type) {
    const dashboardLogs = document.getElementById('dashboard-logs');
    if (dashboardLogs) {
        try {
            const { addTerminalLog } = await import('./dashboard.js');
            addTerminalLog(msg, type);
        } catch (e) {
            console.warn("Dashboard Terminal no disponible en esta vista");
        }
    }
}

export function initSocket() {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');

    if (socket?.connected || !token || !userId) {
        if (!token || !userId) console.warn("⚠️ Socket: No hay sesión activa para conectar.");
        return;
    }

    socket = io(BACKEND_URL, { 
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        auth: { token },      
        query: { userId }     
    });

    socket.on('connect', () => {
        resetWatchdog();
        socket.emit('get-bot-state'); 
        console.log(`✅ Socket: Connected as User ${userId}`);
        sendToDashboardTerminal("Sistema Conectado: Ready", "success");
    });

    socket.on('disconnect', () => {
        console.warn("❌ Socket: Disconnected from Backend");
        updateConnectionStatus('DISCONNECTED');
        sendToDashboardTerminal("Conexión Perdida con Servidor", "error");
    });

    socket.on('connect_error', (err) => {
        console.error("❌ Socket Connection Error:", err.message);
        if (err.message === "Authentication error") {
            logStatus("Sesión expirada o inválida", "error");
        }
    });

    // --- RECEPCIÓN DE PRECIO ---
    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data?.price) {
            const newPrice = parseFloat(data.price);
            currentBotState.price = newPrice;
            
            const priceEl = document.getElementById('auprice');
            if (priceEl) {
                formatCurrency(priceEl, newPrice, currentBotState.lastPrice || 0);
                currentBotState.lastPrice = newPrice;
            }
        }
    });

    // --- ESTADO GLOBAL DEL BOT ---
    socket.on('bot-state-update', async (state) => {
        if (!state) return;

        if (state.config) {
            currentBotState.config = { ...currentBotState.config, ...state.config };
        }
        
        Object.assign(currentBotState, state);

        // [CORRECCIÓN AUDITORÍA] Sincronización con MetricsManager
        // Inyectamos los datos en el motor de métricas si existen en el estado
        if (state.history || state.cycleHistory) {
            try {
                const Metrics = await import('./metricsManager.js');
                Metrics.setAnalyticsData(state.history || state.cycleHistory);
            } catch (err) {
                console.error("Error al inyectar métricas:", err);
            }
        }

        const aiIsActive = (state.aistate === 'RUNNING' || state.isRunning === true);
        currentBotState.isRunning = aiIsActive;

        updateBotUI(currentBotState);

        if (aiBotUI) {
            aiBotUI.setRunningStatus(
                aiIsActive, 
                currentBotState.config.ai?.stopAtCycle, 
                state.historyCount || 0
            );
        }
    });

    // --- LOGS PRIVADOS Y DEBUG STREAM ---
    socket.on('bot-log', (data) => {
        if (!data?.message) return;

        const msg = data.message;
        const isDebug = msg.includes('[DEBUG]') || msg.includes('👁️');

        if (!isDebug) {
            logStatus(msg, data.type || 'info');
        }

        sendToDashboardTerminal(msg, data.type || 'info');

        const aiLogContainer = document.getElementById('ai-log-container');
        if (aiLogContainer) {
            if (aiLogContainer.innerText.includes("Estableciendo enlace")) {
                aiLogContainer.innerHTML = '';
            }
            const visualConf = isDebug ? 0.5 : (data.type === 'success' ? 0.9 : 0.5);
            aiBotUI.addLogEntry(msg, visualConf);
        }
    });

    // --- ACTUALIZACIONES DE IA Y ÓRDENES ---
    socket.on('ai-decision-update', (data) => {
        if (!data || !aiBotUI) return;
        aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        
        if (data.message && data.message.includes('ORDER')) {
            sendToDashboardTerminal(`AI Decision: ${data.message}`, 'warning');
        }
    });

    // LÓGICA UNIFICADA DE ÓRDENES (CONSERVANDO DEBOUNCE ORIGINAL)
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
            if (activeTabBtn) {
                const currentStrategy = activeTabBtn.getAttribute('data-strategy') || 'all';
                const { fetchOrders } = await import('./orders.js');
                fetchOrders(currentStrategy, auOrderList, true); 
            }
        }
    });

    socket.on('ai-history-update', async (trades) => {
        const aiOrderList = document.getElementById('ai-order-list');
        if (aiOrderList) {
            const { fetchOrders } = await import('./orders.js');
            fetchOrders('ai', aiOrderList, true);
        }
        // [NUEVO] También actualizamos métricas si el historial de IA cambia
        if (trades) {
            const Metrics = await import('./metricsManager.js');
            Metrics.setAnalyticsData(trades);
        }
    });

    return socket;
}

function resetWatchdog() {
    updateConnectionStatus('CONNECTED');
    if (connectionWatchdog) clearTimeout(connectionWatchdog);
    connectionWatchdog = setTimeout(() => {
        updateConnectionStatus('DISCONNECTED');
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