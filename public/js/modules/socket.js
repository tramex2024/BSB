
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
 * Helper para obtener el módulo de métricas de forma asíncrona.
 * Evita bloqueos en la carga inicial (Lazy Loading).
 */
const getMetrics = async () => {
    try {
        return await import('./metricsManager.js');
    } catch (err) {
        console.error("Error crítico: No se pudo cargar el módulo de métricas.", err);
        return null;
    }
};

/**
 * Envía logs al Terminal del Dashboard de forma asíncrona.
 */
async function sendToDashboardTerminal(msg, type) {
    try {
        const { addTerminalLog } = await import('./dashboard.js');
        addTerminalLog(msg, type);
    } catch (e) {
        // Silenciar si el dashboard aún no está listo
    }
}

export function initSocket() {
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');

    if (!token || !userId) {
        console.warn("⚠️ Socket: No se detectó una sesión activa.");
        return null;
    }

    if (socket?.connected) return socket;

    // Inicialización del cliente Socket.io
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
        socket.emit('get-bot-state'); // Solicitar estado inicial
        console.log(`✅ Socket: Conectado como Usuario ${userId}`);
        sendToDashboardTerminal("Sistema Conectado: Listo para operar", "success");
        if (typeof updateSystemHealth === 'function') updateSystemHealth('online');
    });

    socket.on('disconnect', () => {
        updateConnectionStatus('DISCONNECTED');
        sendToDashboardTerminal("Conexión perdida con el servidor", "error");
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
                // Comparamos con el último precio para aplicar color verde/rojo
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
        // Verificamos si el usuario está editando un campo para no sobrescribir su escritura
        const isEditing = Object.values(activeEdits).some(timestamp => (now - timestamp) < 2000);

        if (isEditing) {
            // Sincronización parcial: solo balances y estados de ejecución
            currentBotState.lastAvailableUSDT = state.lastAvailableUSDT ?? currentBotState.lastAvailableUSDT;
            currentBotState.lastAvailableBTC = state.lastAvailableBTC ?? currentBotState.lastAvailableBTC;
            currentBotState.lstate = state.lstate ?? currentBotState.lstate;
            currentBotState.sstate = state.sstate ?? currentBotState.sstate;
        } else {
            // Sincronización total
            if (state.config) {
                currentBotState.config = { ...currentBotState.config, ...state.config };
            }
            Object.assign(currentBotState, state);
            updateBotUI(currentBotState);
        }

        // Sincronización de métricas (Snapshot completo)
        const historyData = state.history || state.cycleHistory;
        if (historyData) {
            const m = await getMetrics();
            if (m) m.setAnalyticsData(historyData, true);
        }

        syncDashboardWidgets(currentBotState);

        if (aiBotUI) {
            const aiIsActive = (state.aistate === 'RUNNING' || state.isRunning === true);
            aiBotUI.setRunningStatus(aiIsActive, currentBotState.config.ai?.stopAtCycle, state.historyCount || 0);
        }
    });

    // --- EVENTOS DE HISTORIAL ESPECÍFICOS ---
    socket.on('history_update', async (data) => {
        const m = await getMetrics();
        if (m) m.setAnalyticsData(data, true); // True: Limpia memoria previa
    });
    
    socket.on('new_cycle', async (data) => {
        const m = await getMetrics();
        if (m) m.setAnalyticsData(data, false); // False: Solo añade el nuevo registro
    });

    // --- LOGS Y DEBUG ---
    socket.on('bot-log', (data) => {
        if (!data?.message) return;
        const msg = data.message;
        const isDebug = msg.includes('[DEBUG]');

        if (!isDebug) logStatus(msg, data.type || 'info');
        sendToDashboardTerminal(msg, data.type || 'info');

        if (aiBotUI && document.getElementById('ai-log-container')) {
            aiBotUI.addLogEntry(msg, isDebug ? 0.5 : 0.9);
        }
    });

    // --- ÓRDENES ABIERTAS ---
    socket.on('open-orders-update', async () => {
        const { fetchOrders } = await import('./orders.js');
        const aiList = document.getElementById('ai-order-list');
        if (aiList) fetchOrders('ai', aiList, true);
        
        const auList = document.getElementById('au-order-list');
        if (auList) fetchOrders('all', auList, true);
    });

    return socket;
}

/**
 * Actualiza widgets visuales que dependen del estado global.
 */
async function syncDashboardWidgets(state) {
    if (document.getElementById('balanceDonutChart')) {
        const { updateDistributionWidget } = await import('./dashboard.js');
        updateDistributionWidget(state);
    }
}

/**
 * Cambia el color y el icono de la variación porcentual del precio.
 */
function updatePriceVariationUI(percent) {
    const percentEl = document.getElementById('price-percent');
    const iconEl = document.getElementById('price-icon');
    if (!percentEl || !iconEl) return;

    const val = parseFloat(percent);
    percentEl.textContent = `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
    const colorClass = val > 0 ? 'text-emerald-500' : (val < 0 ? 'text-red-500' : 'text-gray-400');
    percentEl.className = `font-bold ${colorClass}`;
    iconEl.className = `fas ${val > 0 ? 'fa-caret-up' : (val < 0 ? 'fa-caret-down' : 'fa-minus')} mr-1 ${colorClass}`;
}

/**
 * Reinicia el temporizador de desconexión.
 */
function resetWatchdog() {
    updateConnectionStatus('CONNECTED');
    if (connectionWatchdog) clearTimeout(connectionWatchdog);
    connectionWatchdog = setTimeout(() => {
        updateConnectionStatus('DISCONNECTED');
        if (typeof updateSystemHealth === 'function') updateSystemHealth('offline');
    }, 15000);
}

/**
 * Cambia visualmente el punto de estado (Online/Offline).
 */
function updateConnectionStatus(status) {
    const statusDot = document.getElementById('status-dot');
    if (statusDot) {
        const isConnected = status === 'CONNECTED';
        statusDot.className = `w-3 h-3 rounded-full transition-all duration-500 ${
            isConnected ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]'
        }`;
    }
}