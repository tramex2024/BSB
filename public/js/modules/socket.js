/**
 * socket.js - Communication Layer (Full Sync 2026)
 */
import { BACKEND_URL, currentBotState, logStatus } from '../main.js';
import aiBotUI from './aiBotUI.js';
import { updateBotUI } from './uiManager.js'; 
import { formatCurrency } from './ui/formatters.js'; // Importamos el formateador

export let socket = null;
let connectionWatchdog = null;

export function initSocket() {
    if (socket?.connected || typeof io === 'undefined') return;

    socket = io(BACKEND_URL, { 
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => {
        resetWatchdog();
        socket.emit('get-bot-state'); 
        console.log("✅ Socket: Connected to Backend");
    });

    socket.on('disconnect', () => {
        updateConnectionStatus('DISCONNECTED');
    });

    // --- RECEPCIÓN DE PRECIO (CORREGIDO) ---
    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data?.price) {
            const newPrice = parseFloat(data.price);
            currentBotState.price = newPrice;
            
            // OPTIMIZACIÓN: Solo actualizamos el elemento del precio en el DOM
            // No llamamos a updateBotUI para no re-renderizar botones y causar parpadeo
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

        // Aseguramos que el estado de IA se derive correctamente
        const aiIsActive = (state.aistate === 'RUNNING' || state.isRunning === true);
        currentBotState.isRunning = aiIsActive;

        // Aquí SÍ actualizamos la UI completa porque es un cambio de estado real
        updateBotUI(currentBotState);

        if (aiBotUI) {
            aiBotUI.setRunningStatus(
                aiIsActive, 
                currentBotState.config.ai?.stopAtCycle, 
                state.historyCount || 0
            );
        }
    });

    socket.on('bot-log', (data) => {
        if (!data?.message) return;
        logStatus(data.message, data.type || 'info');
        if (aiBotUI?.addLogEntry) {
            aiBotUI.addLogEntry(data.message, (data.type === 'success' ? 0.9 : 0.5));
        }
    });

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