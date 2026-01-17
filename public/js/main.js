// public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI } from './modules/uiManager.js';

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';
export let socket = null;

export let currentBotState = {
    price: 0,
    sstate: 'STOPPED',
    lstate: 'STOPPED',
    config: {}
};

let logQueue = [];
let isProcessingLog = false;
let connectionWatchdog = null;
let errorInterval = null;

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),    
    aibot: () => import('./modules/aibot.js')
};

function updateConnectionStatus(connected) {
    const statusDot = document.getElementById('status-dot');
    if (!statusDot) return;

    if (connected) {
        statusDot.classList.remove('status-red');
        statusDot.classList.add('status-green');
        
        if (errorInterval) {
            clearInterval(errorInterval);
            errorInterval = null;
            // Limpiamos los warnings acumulados para que no retrasen los logs nuevos
            logQueue = logQueue.filter(msg => msg.type !== 'error');
            logStatus("✅ Conexión restaurada", "success");
        }
    } else {
        statusDot.classList.remove('status-green');
        statusDot.classList.add('status-red');

        if (!errorInterval) {
            const warningMsg = "⚠️ ALERTA: Sin recepción de datos";
            logStatus(warningMsg, "error"); 
            
            errorInterval = setInterval(() => {
                // Solo añadimos si no hay ya demasiados en cola para no saturar
                if (logQueue.length < 3) {
                    logStatus(warningMsg, "error");
                }
            }, 2000); // Inyectamos cada 2s
        }
    }
}

function resetWatchdog() {
    updateConnectionStatus(true);
    if (connectionWatchdog) clearTimeout(connectionWatchdog);
    connectionWatchdog = setTimeout(() => {
        updateConnectionStatus(false);
    }, 3000);
}

// --- GESTIÓN DE LOGS (Optimizado) ---
export function logStatus(message, type = 'info') {
    logQueue.push({ message, type });
    if (logQueue.length > 20) logQueue.shift();
    if (!isProcessingLog) processNextLog();
}

function processNextLog() {
    if (logQueue.length === 0) {
        isProcessingLog = false;
        return;
    }

    isProcessingLog = true;
    const log = logQueue.shift();
    const logEl = document.getElementById('log-message');
    const logBar = document.getElementById('log-bar');

    if (logEl && logBar) {
        logEl.textContent = log.message;
        const colors = { success: 'text-emerald-400', error: 'text-red-400', warning: 'text-yellow-400', info: 'text-blue-400' };
        logEl.className = `transition-opacity duration-300 font-medium ${colors[log.type] || 'text-gray-400'}`;
        
        logBar.style.backgroundColor = log.type === 'error' ? '#7f1d1d' : '#111827';
        logEl.style.opacity = '1';

        // TIEMPO DE ESPERA REDUCIDO a 1.5s para mayor agilidad
        setTimeout(() => {
            logEl.style.opacity = '0.5';
            processNextLog();
        }, 1500); 
    } else {
        isProcessingLog = false;
    }
}

// --- INICIALIZACIÓN ---
export function initializeFullApp() {
    if (socket && socket.connected) return;

    socket = io(BACKEND_URL, { 
        path: '/socket.io', 
        transports: ['websocket'], 
        reconnection: true
    });

    socket.on('connect', () => {
        updateConnectionStatus(true);
        socket.emit('get-bot-state');
    });

    socket.on('disconnect', () => {
        updateConnectionStatus(false);
    });

    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data && data.price != null) {
            currentBotState.price = data.price;
            updateBotUI(currentBotState);
        }
    });

    socket.on('bot-log', (log) => {
        logStatus(log.message, log.type);
    });

    socket.on('bot-state-update', (state) => {
        resetWatchdog();
        if (state) {
            currentBotState = { ...currentBotState, ...state };
            updateBotUI(currentBotState);
        }
    });

    setupNavTabs(initializeTab);
}

export async function initializeTab(tabName) {
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
                updateBotUI(currentBotState);
            }
        }
    } catch (error) { console.error("❌ Error cargando vista:", error); }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();
    if (localStorage.getItem('token')) { 
        initializeFullApp(); 
    } else { 
        initializeTab('dashboard'); 
    }
});