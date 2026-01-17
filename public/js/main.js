// public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI } from './modules/uiManager.js';

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';
export let socket = null;

// --- MEMORIA CENTRAL (Estado Persistente) ---
export let currentBotState = {
    price: 0,
    sstate: 'STOPPED',
    lstate: 'STOPPED',
    config: {}
};

// Variables para la gestión de logs (Originales)
let logQueue = [];
let isProcessingLog = false;

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),    
    aibot: () => import('./modules/aibot.js')
};

// --- LÓGICA DE MONITOREO (WATCHDOG) ---
let connectionWatchdog = null;

function resetWatchdog() {
    const statusDot = document.getElementById('status-dot');
    
    if (statusDot && statusDot.classList.contains('status-red')) {
        statusDot.className = 'status-dot-base status-green';
    }

    if (connectionWatchdog) clearTimeout(connectionWatchdog);

    connectionWatchdog = setTimeout(() => {
        if (statusDot) {
            console.warn('⚠️ Watchdog: Sin datos detectados en 2 segundos.');
            statusDot.className = 'status-dot-base status-red';
        }
    }, 2000);
}

/**
 * Sistema de gestión de Logs original con retardo
 */
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
        
        const colors = {
            success: 'text-emerald-400',
            error: 'text-red-400',
            warning: 'text-yellow-400',
            info: 'text-blue-400'
        };
        
        logEl.className = `transition-opacity duration-300 font-medium ${colors[log.type] || 'text-gray-400'}`;
        logBar.style.backgroundColor = log.type === 'error' ? '#7f1d1d' : '#111827';
        logEl.style.opacity = '1';

        setTimeout(() => {
            logEl.style.opacity = '0.5';
            processNextLog();
        }, 2500);
    } else {
        isProcessingLog = false;
    }
}

export function logStatus(message, type = 'info') {
    logQueue.push({ message, type });
    if (!isProcessingLog) processNextLog();
}

/**
 * Inicializa la conexión Socket.io
 */
export function initializeFullApp() {
    if (socket && socket.connected) return;

    const statusDot = document.getElementById('status-dot');

    socket = io(BACKEND_URL, { 
        path: '/socket.io', 
        transports: ['websocket'], 
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => {
        logStatus("✅ Conexión establecida", "success");
        if (statusDot) {
            statusDot.className = 'status-dot-base status-green';
        }
        resetWatchdog();
        socket.emit('get-bot-state');
    });

    socket.on('disconnect', (reason) => {
        logStatus(`⚠️ Desconectado: ${reason}`, "error");
        if (statusDot) {
            statusDot.className = 'status-dot-base status-red';
        }
        if (connectionWatchdog) clearTimeout(connectionWatchdog);
    });

    // Evento original para recibir logs del backend
    socket.on('bot-log', (log) => {
        logQueue.push(log);
        if (logQueue.length > 20) logQueue.shift();
        if (!isProcessingLog) processNextLog();
    });

    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data && data.price != null) {
            currentBotState.price = data.price;
            updateBotUI(currentBotState);
        }
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
    } catch (error) {
        console.error("❌ Error cargando vista:", error);
    }
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