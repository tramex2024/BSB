/**
 * socket.js - Communication Layer (Full Sync 2026)
 * Centraliza toda la conexión con el backend y dispara las actualizaciones de UI.
 */
import { BACKEND_URL, currentBotState, logStatus } from '../main.js';
import aiBotUI from './aiBotUI.js';
import { updateBotUI } from './uiManager.js'; 

export let socket = null;
let connectionWatchdog = null;

/**
 * Inicializa la conexión Socket.io
 */
export function initSocket() {
    // Evitar duplicados y verificar que io esté cargado
    if (socket?.connected || typeof io === 'undefined') return;

    socket = io(BACKEND_URL, { 
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    // --- MANEJO DE CONEXIÓN ---
    socket.on('connect', () => {
        resetWatchdog();
        // Pedimos el estado inicial nada más conectar
        socket.emit('get-bot-state'); 
        console.log("✅ Socket: Connected to Backend");
    });

    socket.on('disconnect', () => {
        updateConnectionStatus('DISCONNECTED');
        console.warn("❌ Socket: Disconnected");
    });

    // --- RECEPCIÓN DE PRECIO EN TIEMPO REAL ---
    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data?.price) {
            // Actualizamos el estado global
            currentBotState.price = parseFloat(data.price);
            
            // DISPARADOR: Actualiza el precio y elementos dependientes en la UI
            updateBotUI(currentBotState); 
        }
    });

    // --- ESTADO GLOBAL DEL BOT (Balances, Ciclos, Estados) ---
    socket.on('bot-state-update', (state) => {
        if (!state) return;

        // Mezclamos la configuración nueva con la existente
        if (state.config) {
            currentBotState.config = { ...currentBotState.config, ...state.config };
        }
        
        // Sincronizamos el resto de propiedades al estado global
        Object.assign(currentBotState, state);

        // Mapeo de banderas de ejecución para compatibilidad
        currentBotState.isRunning = (state.aistate === 'RUNNING' || currentBotState.config.ai?.enabled);
        currentBotState.stopAtCycle = currentBotState.config.ai?.stopAtCycle || false;

        // DISPARADOR: Refresca Dashboard y Controles de todas las pestañas
        updateBotUI(currentBotState);

        // Actualización específica de la pestaña AI
        if (aiBotUI) {
            aiBotUI.setRunningStatus(
                currentBotState.isRunning, 
                currentBotState.stopAtCycle, 
                state.historyCount
            );
        }
    });

    // --- SISTEMA DE LOGS ---
    socket.on('bot-log', (data) => {
        if (!data?.message) return;
        
        // Log en la marquesina superior
        logStatus(data.message, data.type || 'info');
        
        // Log en la consola de la pestaña AI
        if (aiBotUI?.addLogEntry) {
            aiBotUI.addLogEntry(data.message, (data.type === 'success' ? 0.9 : 0.5));
        }
    });

    // --- ACTUALIZACIÓN DE DECISIONES NEURALES ---
    socket.on('ai-decision-update', (data) => {
        if (!data || !aiBotUI) return;
        
        // Actualiza el círculo de confianza y el texto predictivo
        aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        
        // Si la decisión implica un cambio de estado, refrescamos UI general
        updateBotUI(currentBotState);
    });

    // --- TABLAS DE ÓRDENES Y TRADES ---
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

// --- UTILIDADES DE CONEXIÓN (Watchdog) ---

function resetWatchdog() {
    updateConnectionStatus('CONNECTED');
    if (connectionWatchdog) clearTimeout(connectionWatchdog);
    
    // Si no recibimos nada en 15 segundos, marcamos como desconectado
    connectionWatchdog = setTimeout(() => {
        updateConnectionStatus('DISCONNECTED');
    }, 15000);
}

function updateConnectionStatus(status) {
    const statusDot = document.getElementById('status-dot');
    const isConnected = status === 'CONNECTED';
    
    if (statusDot) {
        statusDot.className = `w-3 h-3 rounded-full transition-all duration-500 ${
            isConnected 
            ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]' 
            : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]'
        }`;
    }
}