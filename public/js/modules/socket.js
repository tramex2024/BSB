/**
 * socket.js - Communication Layer (Full Sync 2026)
 * Versión: BSB 2026 - Soporte Multiusuario y Salas Privadas
 */
import { BACKEND_URL, currentBotState, logStatus } from '../main.js';
import aiBotUI from './aiBotUI.js';
import { updateBotUI } from './uiManager.js'; 
import { formatCurrency } from './ui/formatters.js';

export let socket = null;
let connectionWatchdog = null;

export function initSocket() {
    // 1. Recuperamos credenciales del localStorage
    const token = localStorage.getItem('token');
    const userId = localStorage.getItem('userId');

    // Evitamos duplicar conexiones o conectar sin sesión
    if (socket?.connected || !token || !userId) {
        if (!token || !userId) console.warn("⚠️ Socket: No hay sesión activa para conectar.");
        return;
    }

    // 2. CONEXIÓN AUTENTICADA: Enviamos token y userId en el handshake
    socket = io(BACKEND_URL, { 
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        auth: { token },      // El middleware del backend validará este token
        query: { userId }     // El backend usará esto para unirnos a la sala user_userId
    });

    socket.on('connect', () => {
        resetWatchdog();
        // Pedimos el estado inicial específico de nuestro bot al conectar
        socket.emit('get-bot-state'); 
        console.log(`✅ Socket: Connected as User ${userId}`);
    });

    socket.on('disconnect', () => {
        console.warn("❌ Socket: Disconnected from Backend");
        updateConnectionStatus('DISCONNECTED');
    });

    socket.on('connect_error', (err) => {
        console.error("❌ Socket Connection Error:", err.message);
        if (err.message === "Authentication error") {
            logStatus("Sesión expirada o inválida", "error");
        }
    });

    // --- RECEPCIÓN DE PRECIO (Público) ---
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

    // --- ESTADO GLOBAL DEL BOT (Privado - Solo para este usuario) ---
    socket.on('bot-state-update', (state) => {
        if (!state) return;

        // Mezclamos la configuración recibida con la local
        if (state.config) {
            currentBotState.config = { ...currentBotState.config, ...state.config };
        }
        
        Object.assign(currentBotState, state);

        // Derivamos el estado de ejecución de la IA
        const aiIsActive = (state.aistate === 'RUNNING' || state.isRunning === true);
        currentBotState.isRunning = aiIsActive;

        // Actualización integral de la UI
        updateBotUI(currentBotState);

        if (aiBotUI) {
            aiBotUI.setRunningStatus(
                aiIsActive, 
                currentBotState.config.ai?.stopAtCycle, 
                state.historyCount || 0
            );
        }
    });

    // --- LOGS PRIVADOS ---
    socket.on('bot-log', (data) => {
        if (!data?.message) return;
        logStatus(data.message, data.type || 'info');
        if (aiBotUI?.addLogEntry) {
            aiBotUI.addLogEntry(data.message, (data.type === 'success' ? 0.9 : 0.5));
        }
    });

    // --- ACTUALIZACIONES DE IA Y ÓRDENES ---
    socket.on('ai-decision-update', (data) => {
        if (!data || !aiBotUI) return;
        aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
    });

    socket.on('open-orders-update', (data) => {
        const orders = Array.isArray(data) ? data : (data.orders || []);
        if (aiBotUI?.updateOpenOrdersTable) {
            aiBotUI.updateOpenOrdersTable(orders);
        }
    });

    socket.on('ai-history-update', (trades) => {
        if (aiBotUI?.updateHistoryTable) {
            aiBotUI.updateHistoryTable(trades);
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