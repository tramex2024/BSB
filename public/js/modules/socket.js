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
    
    if (statusDot) statusDot.className = `w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`;
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
    if (socket?.connected || typeof io === 'undefined') return;

    socket = io(BACKEND_URL, { 
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5
    });

    socket.on('connect', () => {
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
        currentBotState.openOrders = orders;
        if (aiBotUI?.updateOpenOrdersTable) aiBotUI.updateOpenOrdersTable(orders);
        renderAutobotOrders(orders, 'opened'); 
    });

    socket.on('history-orders-all', (data) => {
        const history = Array.isArray(data) ? data : [];
        currentBotState.ordersHistory = history;
        renderAutobotOrders(history, 'all');
        renderAutobotOrders(history.filter(o => o.status === 'FILLED'), 'filled');
        renderAutobotOrders(history.filter(o => o.status.includes('CANCE')), 'cancelled');
    });

    socket.on('bot-state-update', (state) => {
        if (!state) return;
        if (state.config) {
            currentBotState.config = { ...currentBotState.config, ...state.config };
            delete state.config;
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