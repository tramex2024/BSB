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
    if (typeof io === 'undefined') return;

    socket = io(BACKEND_URL, { 
        transports: ['websocket', 'polling'],
        reconnection: true 
    });

    socket.on('connect', () => {
        updateConnectionStatus('CONNECTED');
        socket.emit('get-bot-state'); 
        socket.emit('get-ai-status');  
    });

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
            if(state.virtualAiBalance) {
                const balEl = document.getElementById('ai-virtual-balance');
                if(balEl) balEl.innerText = `$${state.virtualAiBalance.toFixed(2)}`;
            }
        }
        updateBotUI(currentBotState);
        updateControlsState(currentBotState); 
    });

    // 🧠 LISTENERS ESPECÍFICOS DE IA
    socket.on('ai-decision-update', (data) => {
        aiBotUI.updateConfidence(data.confidence);
        aiBotUI.addLog(data.message);
    });

    socket.on('ai-history-update', (trades) => {
        aiBotUI.updateHistoryTable(trades);
    });

    // Sincronización de estado IA (Garantiza que el botón no rebote)
    socket.on('ai-status-update', (data) => {
    currentBotState.virtualBalance = data.virtualBalance;
    currentBotState.isRunning = data.isRunning;
    
    // Si estamos en el dashboard, actualizamos el widget
    const canvas = document.getElementById('balanceDonutChart');
    if (canvas) {
        // Esta función debe estar expuesta o llamada desde el dashboard
        updateDistributionWidget(currentBotState); 
    }
});

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
        const html = await response.text();
        mainContent.innerHTML = html;
        
        if (views[tabName]) {
            const module = await views[tabName]();
            const initFnName = `initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`;
            if (typeof module[initFnName] === 'function') {
                await module[initFnName](currentBotState); 
            }
        }

        // Lógica del botón de la IA
        if (tabName === 'aibot') {
            const btnAi = document.getElementById('btn-start-ai');
            if (btnAi) {
                aiBotUI.setRunningStatus(currentBotState.isRunning); 

                btnAi.onclick = async () => {
                    const action = currentBotState.isRunning ? 'stop' : 'start';
                    
                    // Feedback visual inmediato (Bloqueo preventivo)
                    btnAi.disabled = true;
                    btnAi.innerText = "PROCESANDO...";
                    btnAi.className = "w-full py-4 bg-gray-700 text-white rounded-2xl font-black text-xs animate-pulse";

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
                            // Actualización forzada
                            currentBotState.isRunning = data.isRunning;
                            aiBotUI.setRunningStatus(data.isRunning);
                            aiBotUI.addLog(`Sistema IA: ${action === 'start' ? 'Iniciado' : 'Detenido'}`);
                        }
                    } catch (e) {
                        aiBotUI.addLog("Error de conexión con el núcleo");
                        // Revertir estado visual en caso de error
                        aiBotUI.setRunningStatus(currentBotState.isRunning);
                    } finally {
                        btnAi.disabled = false;
                    }
                };
            }
        }

    } catch (error) { 
        console.error("❌ Error cargando vista:", error); 
    }
}

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

// Sincronización al volver a la pestaña o app
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && socket && socket.connected) {
        socket.emit('get-bot-state'); 
        socket.emit('get-ai-status'); 
        
        // Refresco visual basado en memoria persistente
        updateControlsState(currentBotState);
        if (typeof aiBotUI !== 'undefined') {
            aiBotUI.setRunningStatus(currentBotState.isRunning);
        }
    }
});