/**
 * socket.js - Real-time Communication Bridge
 */
import { BACKEND_URL, currentBotState, logStatus } from '../main.js';
import { updateBotUI, updateControlsState, renderAutobotOrders } from './uiManager.js';
import aiBotUI from './aiBotUI.js';

let socket = null;
let connectionWatchdog = null;

function updateConnectionStatus(status) {
    const statusDot = document.getElementById('status-dot');
    const aiSyncDot = document.getElementById('ai-sync-dot');
    const aiSyncText = document.getElementById('ai-sync-text');
    const isConnected = status === 'CONNECTED';
    
    // Usamos IDs consistentes con index.html
    if (statusDot) statusDot.className = `status-dot-base ${isConnected ? 'status-green shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'status-red'}`;
    if (aiSyncDot) aiSyncDot.classList.toggle('bg-emerald-500', isConnected);
    if (aiSyncDot) aiSyncDot.classList.toggle('bg-gray-500', !isConnected);
    if (aiSyncText) aiSyncText.innerText = isConnected ? "AI CORE LINKED" : "DISCONNECTED";
}

function resetWatchdog() {
    updateConnectionStatus('CONNECTED');
    if (connectionWatchdog) clearTimeout(connectionWatchdog);
    connectionWatchdog = setTimeout(() => updateConnectionStatus('DISCONNECTED'), 15000);
}

export function initSocket() {
    // Si ya existe una instancia o la librería no está cargada, abortamos
    if (socket?.connected || typeof io === 'undefined') return socket;

    socket = io(BACKEND_URL, { 
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5
    });

    socket.on('connect', () => {
        console.log("📡 Socket Connected");
        resetWatchdog();
        socket.emit('get-bot-state'); 
    });

    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data?.price) {
            currentBotState.price = parseFloat(data.price);
            updateBotUI(currentBotState);
        }
    });

    socket.on('bot-log', (data) => {
        if (!data?.message) return;
        logStatus(data.message, data.type || 'info');
        if (aiBotUI?.addLog) aiBotUI.addLog(data.message, data.type);
    });

    socket.on('open-orders-update', (orders) => {
        const ordersList = Array.isArray(orders) ? orders : [];
        currentBotState.openOrders = ordersList;
        if (aiBotUI?.updateOpenOrdersTable) aiBotUI.updateOpenOrdersTable(ordersList);
        renderAutobotOrders(ordersList, 'opened'); 
    });

    socket.on('history-orders-all', (data) => {
        const history = Array.isArray(data) ? data : [];
        currentBotState.ordersHistory = history;
        
        renderAutobotOrders(history, 'all');
        renderAutobotOrders(history.filter(o => o.status === 'FILLED'), 'filled');
        
        // 🛡️ FIX LINE 65: Safe check for status before .includes()
        renderAutobotOrders(history.filter(o => o.status && typeof o.status === 'string' && o.status.includes('CANCE')), 'cancelled');
    });

    socket.on('bot-state-update', (state) => {
        if (!state) return;
        
        // Merge config safely
        if (state.config) {
            currentBotState.config = { 
                ...currentBotState.config, 
                ...state.config 
            };
            // No eliminamos state.config para que Object.assign no de problemas, 
            // mejor asignamos el resto de propiedades
        }
        
        Object.assign(currentBotState, state);
        
        updateBotUI(currentBotState);
        updateControlsState(currentBotState); 
        
        const formattedBal = `$${(currentBotState.aibalance || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        document.querySelectorAll('.ai-balance-val').forEach(el => el.innerText = formattedBal);
    });

    socket.on('ai-decision-update', (data) => {
        if (!data || !aiBotUI) return;
        aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        
        if (data.indicators) {
            const adxEl = document.getElementById('ai-adx-val');
            const stochEl = document.getElementById('ai-stoch-val');
            if (adxEl) adxEl.innerText = (data.indicators.adx || 0).toFixed(1);
            if (stochEl) stochEl.innerText = (data.indicators.stochRsi || 0).toFixed(1);
        }
    });

    socket.on('panic-executed', () => {
        logStatus("🚨 PANIC STOP EXECUTED", "error");
        currentBotState.lstate = 'STOPPED';
        currentBotState.sstate = 'STOPPED';
        updateBotUI(currentBotState);
    });

    socket.on('disconnect', () => updateConnectionStatus('DISCONNECTED'));
    
    return socket;
}