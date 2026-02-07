/**
 * socket.js - Communication Layer
 * Centraliza toda la conexión con el backend para que sea persistente.
 */
import { BACKEND_URL, currentBotState, logStatus } from './main.js';
import aiBotUI from './modules/aiBotUI.js';

export let socket = null;
let connectionWatchdog = null;

/**
 * Inicializa la conexión Socket.io
 */
export function initSocket() {
    if (socket?.connected || typeof io === 'undefined') return;

    socket = io(BACKEND_URL, { 
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5
    });

    // --- MANEJO DE CONEXIÓN ---
    socket.on('connect', () => {
        resetWatchdog();
        socket.emit('get-bot-state'); 
        console.log("✅ Socket: Connected to Backend");
    });

    socket.on('disconnect', () => {
        updateConnectionStatus('DISCONNECTED');
    });

    // --- RECEPCIÓN DE DATOS DE MERCADO ---
    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data?.price) {
            currentBotState.price = parseFloat(data.price);
            // El main.js se encargará de actualizar la UI mediante un observador o llamada
        }
    });

    // --- ESTADO GLOBAL DEL BOT ---
    socket.on('bot-state-update', (state) => {
        if (!state) return;

        // Sincronizamos el estado global
        if (state.config) {
            currentBotState.config = { ...currentBotState.config, ...state.config };
        }
        Object.assign(currentBotState, state);

        // Mapeo específico para IA (Compatibilidad con tus módulos)
        currentBotState.isRunning = (state.aistate === 'RUNNING' || currentBotState.config.ai?.enabled);
        currentBotState.stopAtCycle = currentBotState.config.ai?.stopAtCycle || false;

        // Actualizamos la UI de la IA si el módulo está disponible y hay elementos en el DOM
        if (aiBotUI) {
            aiBotUI.setRunningStatus(currentBotState.isRunning, currentBotState.stopAtCycle, state.historyCount);
        }
    });

    // --- LOGS Y DECISIONES DE IA ---
    socket.on('bot-log', (data) => {
        if (!data?.message) return;
        logStatus(data.message, data.type || 'info');
        if (aiBotUI?.addLogEntry) aiBotUI.addLogEntry(data.message, (data.type === 'success' ? 0.9 : 0.5));
    });

    socket.on('ai-decision-update', (data) => {
        if (!data || !aiBotUI) return;
        aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
    });

    // --- ÓRDENES Y TABLAS ---
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

// --- FUNCIONES DE SOPORTE (STATUS UI) ---

function resetWatchdog() {
    updateConnectionStatus('CONNECTED');
    if (connectionWatchdog) clearTimeout(connectionWatchdog);
    connectionWatchdog = setTimeout(() => updateConnectionStatus('DISCONNECTED'), 15000);
}

function updateConnectionStatus(status) {
    const statusDot = document.getElementById('status-dot');
    const isConnected = status === 'CONNECTED';
    if (statusDot) {
        statusDot.className = `w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`;
    }
    // Nota: El texto "AI CORE LINKED" se puede actualizar aquí también si el elemento existe
}