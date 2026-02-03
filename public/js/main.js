//BSB/public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI, updateControlsState } from './modules/uiManager.js'; 
import aiBotUI from './modules/aiBotUI.js';

// --- CONFIGURACIÓN ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';

// Estructura limpia que refleja exactamente el modelo Autobot.js de la DB
export const currentBotState = {
    price: 0,
    lstate: 'STOPPED',
    sstate: 'STOPPED',
    aibalance: 0, // Balance operativo de la IA (mapeado de la DB)
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

// --- GESTIÓN DE CONEXIÓN ---
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

// --- INICIALIZACIÓN DE SOCKETS ---
export function initializeFullApp() {
    if (socket?.connected || typeof io === 'undefined') return;

    socket = io(BACKEND_URL, { 
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5
    });

    socket.on('connect', () => {
        resetWatchdog();
        socket.emit('get-bot-state'); // Esto traerá el Autobot.findOne({})
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

    // RECEPTOR CENTRAL DE ESTADO (UNIFICADO)
    socket.on('bot-state-update', (state) => {
    //console.log("📥 DATOS RECIBIDOS DEL SERVIDOR:", state);
    if (!state) return;

    // Sincronización de Configuración
    if (state.config) {
        currentBotState.config = { ...currentBotState.config, ...state.config };
        delete state.config;
    }

    Object.assign(currentBotState, state);
    
    // UI Global
    updateBotUI(currentBotState);
    updateControlsState(currentBotState); 

    // IA específica: Usamos un selector de clase para actualizar TODOS los espejos de balance
    const balances = document.querySelectorAll('.ai-balance-val');
    const formattedBal = `$${(currentBotState.aibalance || 0).toLocaleString('en-US', {minimumFractionDigits: 2})}`;
    balances.forEach(el => el.innerText = formattedBal);
    
    if (aiBotUI) {
        aiBotUI.setRunningStatus(currentBotState.config.ai.enabled, currentBotState.config.ai.stopAtCycle);
    }
});

    socket.on('ai-decision-update', (data) => {
        if (!data) return;
        aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        if (data.indicators) {
            const adxEl = document.getElementById('ai-adx-val');
            const stochEl = document.getElementById('ai-stoch-val');
            if (adxEl) adxEl.innerText = (data.indicators.adx || 0).toFixed(1);
            if (stochEl) stochEl.innerText = (data.indicators.stochRsi || 0).toFixed(1);
        }
    });

    socket.on('ai-history-update', (trades) => aiBotUI.updateHistoryTable(trades));

    socket.on('disconnect', () => updateConnectionStatus('DISCONNECTED'));
}

// --- GESTIÓN DE PESTAÑAS ---
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
            const initFn = module[`initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`];
            if (initFn) await initFn(currentBotState); 
        }

        // LÓGICA ESPECÍFICA PESTAÑA AIBOT
        if (tabName === 'aibot') {
            const btnAi = document.getElementById('btn-start-ai');
            const aiInput = document.getElementById('ai-amount-usdt');
            const stopAtCycleCheck = document.getElementById('ai-stop-at-cycle');

            // Sincronización Inicial de UI IA
            aiBotUI.setRunningStatus(currentBotState.config.ai.enabled, currentBotState.config.ai.stopAtCycle);
            if (aiInput) aiInput.value = currentBotState.config.ai.amountUsdt || "";
            if (stopAtCycleCheck) stopAtCycleCheck.checked = currentBotState.config.ai.stopAtCycle;

            // 1. Evento Monto USDT (Debounce 1.5s)
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
                        if ((await res.json()).success) aiBotUI.addLog(`IA: Capital actualizado a $${amount}`, 'info');
                    }, 1500);
                });
            }

            // 2. Evento Switch "Stop at Cycle"
            if (stopAtCycleCheck) {
                stopAtCycleCheck.onchange = async () => {
                    const active = stopAtCycleCheck.checked;
                    const res = await fetch(`${BACKEND_URL}/api/ai/config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                        body: JSON.stringify({ stopAtCycle: active })
                    });
                    if (!(await res.json()).success) stopAtCycleCheck.checked = !active;
                    else aiBotUI.addLog(`IA: Stop at Cycle ${active ? 'Activado' : 'Desactivado'}`, 'warning');
                };
            }

            // 3. Evento Botón Start/Stop
            if (btnAi) {
                btnAi.onclick = async () => {
                    const action = currentBotState.config.ai.enabled ? 'stop' : 'start';
                    btnAi.disabled = true;
                    btnAi.innerText = "PROCESANDO...";

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

    } catch (error) { console.error("❌ Error cargando vista:", error); }
}

// --- EVENTOS INICIALES ---
document.addEventListener('DOMContentLoaded', () => {
    setupNavTabs(initializeTab); 
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();
    
    if (localStorage.getItem('token')) { 
        initializeFullApp(); 
        initializeTab('autobot'); 
    } else { 
        initializeTab('dashboard'); 
    }
});