/**
 * socket.js - Communication Layer (Full Sync 2026)
 * Versión: BSB 2026 - Soporte Multiusuario y Salas Privadas
 * Corregido: Mapeo de estrategias AI/AIBOT para persistencia visual
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
            // Importamos la función solo cuando es necesaria
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
    socket.on('bot-state-update', (state) => {
        if (!state) return;

        if (state.config) {
            currentBotState.config = { ...currentBotState.config, ...state.config };
        }
        
        Object.assign(currentBotState, state);

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

    // --- LOGS PRIVADOS (Aquí conectamos con el Terminal) ---
    socket.on('bot-log', (data) => {
        if (!data?.message) return;
        
        // 1. Log estándar
        logStatus(data.message, data.type || 'info');
        
        // 2. Enviar al Terminal del Dashboard
        sendToDashboardTerminal(data.message, data.type || 'info');

        // 3. Enviar a la UI de la IA si existe
        if (aiBotUI?.addLogEntry) {
            aiBotUI.addLogEntry(data.message, (data.type === 'success' ? 0.9 : 0.5));
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

    socket.on('open-orders-update', (data) => {
        const rawOrders = Array.isArray(data) ? data : (data.orders || []);
        
        // CORRECCIÓN: Filtramos para que acepte tanto 'ai' como 'aibot'
        const aiOrders = rawOrders.filter(o => o.strategy === 'ai' || o.strategy === 'aibot');

        if (aiBotUI?.updateOpenOrdersTable) {
            aiBotUI.updateOpenOrdersTable(aiOrders);
        }
    });

    socket.on('ai-history-update', (trades) => {
        if (!Array.isArray(trades)) return;

        // CORRECCIÓN: Aseguramos que el historial reconozca la estrategia de la DB
        const aiHistory = trades.filter(t => t.strategy === 'ai' || t.strategy === 'aibot');

        if (aiBotUI?.updateHistoryTable) {
            aiBotUI.updateHistoryTable(aiHistory);
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