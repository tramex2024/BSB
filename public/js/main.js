// BSB/public/js/main.js

/**
 * main.js - Central Hub
 * AI Core English Version 2026
 * Estructura original preservada con integración de Dashboard y Panic
 */
import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI, updateControlsState } from './modules/uiManager.js'; 
import aiBotUI from './modules/aiBotUI.js';

// --- CONFIGURATION ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';

// Structure reflecting the Database Model
export const currentBotState = {
    price: 0,
    lstate: 'STOPPED',
    sstate: 'STOPPED',
    aibalance: 0,
    lastAvailableUSDT: 0,
    config: {
        symbol: 'BTCUSDT',
        long: { amountUsdt: 0, enabled: false },
        short: { amountUsdt: 0, enabled: false },
        ai: { amountUsdt: 0, enabled: false, stopAtCycle: false }
    }
};

export let socket = null;
export let intervals = {}; 

let logQueue = [];
let isProcessingLog = false;
let connectionWatchdog = null;

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),    
    aibot: () => import('./modules/aibot.js')
};

// --- CONNECTION MANAGEMENT ---
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

export function logStatus(message, type = 'info') {
    if (type === 'error') logQueue = [{ message, type }]; 
    else {
        if (logQueue.length >= 2) logQueue.shift();
        logQueue.push({ message, type });
    }
    if (!isProcessingLog) processNextLog();
}

function processNextLog() {
    if (logQueue.length === 0) { isProcessingLog = false; return; }
    const logEl = document.getElementById('log-message');
    if (!logEl) return;

    isProcessingLog = true;
    const log = logQueue.shift();
    logEl.textContent = log.message;
    
    const colors = { success: 'text-emerald-400', error: 'text-red-400', warning: 'text-yellow-400', info: 'text-blue-400' };
    logEl.className = `transition-opacity duration-300 font-medium ${colors[log.type] || 'text-gray-400'}`;
    
    setTimeout(() => processNextLog(), 2500);
}

// --- SOCKET INITIALIZATION ---
export function initializeFullApp() {
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

    // RECEPTOR DE PÁNICO (Sincronización Global)
    socket.on('panic-executed', (data) => {
        logStatus("🚨 PANIC STOP EXECUTED", "error");
        currentBotState.lstate = 'STOPPED';
        currentBotState.sstate = 'STOPPED';
        currentBotState.config.long.enabled = false;
        currentBotState.config.short.enabled = false;
        currentBotState.config.ai.enabled = false;
        updateBotUI(currentBotState);
        updateControlsState(currentBotState);
    });

    // CENTRAL STATE RECEIVER
    socket.on('bot-state-update', (state) => {
        if (!state) return;

        if (state.config) {
            currentBotState.config = { ...currentBotState.config, ...state.config };
            delete state.config;
        }

        Object.assign(currentBotState, state);
        
        updateBotUI(currentBotState);
        updateControlsState(currentBotState); 

        // AI Balance Update (All mirrors)
        const balances = document.querySelectorAll('.ai-balance-val');
        const formattedBal = `$${(currentBotState.aibalance || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        balances.forEach(el => el.innerText = formattedBal);
        
        if (aiBotUI) {
            aiBotUI.setRunningStatus(currentBotState.config.ai.enabled, currentBotState.config.ai.stopAtCycle);
        }
    });

    socket.on('ai-decision-update', (data) => {
        if (!data || !aiBotUI) return;
        aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        
        // Signal updates para el Widget del Dashboard y AI Tab
        const adxEl = document.getElementById('ai-adx-val');
        const stochEl = document.getElementById('ai-stoch-val');
        if (adxEl && data.indicators) adxEl.innerText = (data.indicators.adx || 0).toFixed(1);
        if (stochEl && data.indicators) stochEl.innerText = (data.indicators.stochRsi || 0).toFixed(1);
    });

    socket.on('ai-history-update', (trades) => {
        if(aiBotUI) aiBotUI.updateHistoryTable(trades);
    });

    socket.on('disconnect', () => updateConnectionStatus('DISCONNECTED'));
}

// --- TAB MANAGEMENT ---
export async function initializeTab(tabName) {
    Object.values(intervals).forEach(clearInterval);
    intervals = {};

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    try {
        const response = await fetch(`./${tabName}.html`);
        mainContent.innerHTML = await response.text();
        
        if (views[tabName]) {
            const module = await views[tabName]();
            const initFnName = `initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`;
            const initFn = module[initFnName];
            
            if (initFn) {
                await initFn(currentBotState);
                
                // INTEGRACIÓN DASHBOARD: Al cambiar a la pestaña dashboard activamos el gráfico
                if (tabName === 'dashboard') {
                    // Si el módulo exporta una función específica para el widget, la usamos
                    if (module.updateDistributionWidget) {
                        module.updateDistributionWidget(currentBotState);
                    }
                }
            }
        }

        // AI TAB SPECIFIC LOGIC
        if (tabName === 'aibot') {
            const btnAi = document.getElementById('btn-start-ai');
            const aiInput = document.getElementById('ai-amount-usdt');
            const stopAtCycleCheck = document.getElementById('ai-stop-at-cycle');

            aiBotUI.setRunningStatus(currentBotState.config.ai.enabled, currentBotState.config.ai.stopAtCycle);
            if (aiInput) aiInput.value = currentBotState.config.ai.amountUsdt || "";
            if (stopAtCycleCheck) stopAtCycleCheck.checked = currentBotState.config.ai.stopAtCycle;

            if (aiInput) {
                let timeout;
                aiInput.addEventListener('input', () => {
                    clearTimeout(timeout);
                    timeout = setTimeout(async () => {
                        const amount = parseFloat(aiInput.value);
                        if (isNaN(amount) || amount <= 0) return;
                        
                        const res = await fetch(`${BACKEND_URL}/api/ai/config`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                            body: JSON.stringify({ amountUsdt: amount })
                        });
                        const data = await res.json();
                        if (data.success) aiBotUI.addLog(`AI: Capital updated to $${amount}`, 'info');
                    }, 1500);
                });
            }

            if (stopAtCycleCheck) {
                stopAtCycleCheck.onchange = async () => {
                    const active = stopAtCycleCheck.checked;
                    const res = await fetch(`${BACKEND_URL}/api/ai/config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                        body: JSON.stringify({ stopAtCycle: active })
                    });
                    const data = await res.json();
                    if (!data.success) stopAtCycleCheck.checked = !active;
                    else aiBotUI.addLog(`AI: Smart Cycle ${active ? 'Enabled' : 'Disabled'}`, 'warning');
                };
            }

            if (btnAi) {
                btnAi.onclick = async () => {
                    const isCurrentlyEnabled = currentBotState.config.ai.enabled;
                    const action = isCurrentlyEnabled ? 'stop' : 'start';
                    btnAi.disabled = true;
                    btnAi.innerText = "PROCESSING...";

                    const res = await fetch(`${BACKEND_URL}/api/ai/toggle`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                        body: JSON.stringify({ action })
                    });
                    const data = await res.json();
                    if (data.success) {
                        currentBotState.config.ai.enabled = data.isRunning;
                        aiBotUI.setRunningStatus(data.isRunning, currentBotState.config.ai.stopAtCycle);
                    }
                    btnAi.disabled = false;
                };
            }
        }

    } catch (error) { console.error("❌ View Loading Error:", error); }
}

// --- INITIAL EVENTS ---
document.addEventListener('DOMContentLoaded', () => {
    setupNavTabs(initializeTab); 
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();
    
    if (localStorage.getItem('token')) { 
        initializeFullApp(); 
        initializeTab('dashboard'); 
    } else { 
        initializeTab('dashboard'); 
    }
});