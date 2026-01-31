// BSB/server/public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI, updateControlsState } from './modules/uiManager.js'; 
import aiBotUI from './modules/aiBotUI.js';

// --- CONFIGURACIÓN ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';

export const currentBotState = {
    price: 0,
    sstate: 'STOPPED',
    lstate: 'STOPPED',
    lpc: 0, 
    spc: 0, 
    lpm: 0,
    spm: 0,
    isRunning: false, // Estado de la IA
    virtualBalance: 10000.00,
    config: {}
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
    if (!statusDot) return;
    statusDot.classList.remove('status-red', 'status-green', 'status-purple');

    if (status === 'CONNECTED') {
        statusDot.classList.add('status-green');
    } else {
        statusDot.classList.add('status-red');
    }
}

function resetWatchdog() {
    updateConnectionStatus('CONNECTED');
    if (connectionWatchdog) clearTimeout(connectionWatchdog);
    connectionWatchdog = setTimeout(() => {
        updateConnectionStatus('DISCONNECTED');
    }, 5000);
}

export function logStatus(message, type = 'info') {
    if (type === 'error') {
        logQueue = [{ message, type }]; 
    } else {
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
    
    setTimeout(() => { processNextLog(); }, 2500);
}

// --- INICIALIZACIÓN DE SOCKETS ---
export function initializeFullApp() {
    if (socket && socket.connected) return;
    if (typeof io === 'undefined') {
        console.error("Socket.io no detectado. Revisa el script en index.html");
        return;
    }

    socket = io(BACKEND_URL, { 
        transports: ['websocket', 'polling'],
        reconnection: true 
    });

    socket.on('connect', () => {
        updateConnectionStatus('CONNECTED');
        socket.emit('get-bot-state'); 
        socket.emit('get-ai-status');  
    });

    // Evento unificado del MarketWorker
    socket.on('market-update', (data) => {
        resetWatchdog();
        if (data && data.price) {
            currentBotState.price = parseFloat(data.price);
            updateBotUI(currentBotState);
        }
    });

    // Backup para eventos antiguos
    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data && data.price) {
            currentBotState.price = parseFloat(data.price);
            updateBotUI(currentBotState);
        }
    });

    socket.on('bot-log', (data) => {
        if (data && data.message) {
            logStatus(data.message, data.type || 'info');
        }
    });

    socket.on('bot-state-update', (state) => {
        if (state) {
            Object.assign(currentBotState, state);
        }
        updateBotUI(currentBotState);
        updateControlsState(currentBotState); 
    });

    // 🧠 LISTENERS ESPECÍFICOS DE IA
socket.on('ai-decision-update', (data) => {
    if (aiBotUI) {
        // Cambiamos a los nombres reales de tu módulo:
        if (typeof aiBotUI.updateConfidence === 'function') {
            aiBotUI.updateConfidence(data.confidence, data.message, data.isAnalyzing);
        }
        if (typeof aiBotUI.addLogEntry === 'function') { // <--- Antes era addLog
            aiBotUI.addLogEntry(data.message, data.confidence);
        }
        if (data.indicators) {
    const adxEl = document.getElementById('ai-adx-val');
    const stochEl = document.getElementById('ai-stoch-val');
    if (adxEl) adxEl.innerText = data.indicators.adx.toFixed(1);
    if (stochEl) stochEl.innerText = data.indicators.stochRsi.toFixed(1);
}
    }
});

socket.on('ai-history-update', (trades) => {
    if (aiBotUI && typeof aiBotUI.updateHistoryTable === 'function') {
        aiBotUI.updateHistoryTable(trades);
    }
});

    socket.on('ai-order-executed', (data) => {
        if (aiBotUI && typeof aiBotUI.addLog === 'function') {
            aiBotUI.addLog(`🚀 ORDEN EJECUTADA: ${data.side} @ $${data.price}`, 1);
        }
    });

    socket.on('ai-status-update', (data) => {
        currentBotState.virtualBalance = data.virtualBalance;
        currentBotState.isRunning = data.isRunning;
        
        // Actualizar UI si el elemento existe
        const balEl = document.getElementById('ai-virtual-balance');
        if (balEl) balEl.innerText = `$${data.virtualBalance.toFixed(2)}`;

        if (aiBotUI && typeof aiBotUI.setRunningStatus === 'function') {
            aiBotUI.setRunningStatus(data.isRunning);
        }
    });

    socket.on('disconnect', () => updateConnectionStatus('DISCONNECTED'));
}

// --- GESTIÓN DE PESTAÑAS ---
export async function initializeTab(tabName) {
    // Limpiar intervalos de la pestaña anterior
    Object.values(intervals).forEach(clearInterval);
    intervals = {};

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    try {
        const response = await fetch(`./${tabName}.html`);
        const html = await response.text();
        mainContent.innerHTML = html;
        
        if (views[tabName]) {
            const module = await views[tabName]();
            const initFnName = `initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`;
            if (typeof module[initFnName] === 'function') {
                await module[initFnName](currentBotState); 
            }
        }

        // Lógica específica de la vista de IA
        if (tabName === 'aibot') {
            setupAiToggleLogic();
        }

    } catch (error) { 
        console.error("❌ Error cargando vista:", error); 
    }
}

function setupAiToggleLogic() {
    const btnAi = document.getElementById('btn-start-ai');
    if (!btnAi) return;

    if (aiBotUI && typeof aiBotUI.setRunningStatus === 'function') {
        aiBotUI.setRunningStatus(currentBotState.isRunning); 
    }

    btnAi.onclick = async () => {
        const action = currentBotState.isRunning ? 'stop' : 'start';
        
        btnAi.disabled = true;
        btnAi.innerText = "PROCESANDO...";

        try {
            const res = await fetch(`${BACKEND_URL}/api/ai/toggle`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ action })
            });
            const data = await res.json();
            
            if(data.success) {
                currentBotState.isRunning = data.isRunning;
                if (aiBotUI && typeof aiBotUI.setRunningStatus === 'function') {
                    aiBotUI.setRunningStatus(data.isRunning);
                }
            }
        } catch (e) {
            console.error("Error toggle IA:", e);
        } finally {
            btnAi.disabled = false;
        }
    };
}

// --- ARRANQUE ---
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

// Sincronización al recuperar foco
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && socket && socket.connected) {
        socket.emit('get-bot-state'); 
        socket.emit('get-ai-status'); 
    }
});