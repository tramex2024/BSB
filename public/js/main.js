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
let isOffline = false; 

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),    
    aibot: () => import('./modules/aibot.js')
};

/**
 * Control de estados visuales críticos
 */
function setInstantError(message, active) {
    const logEl = document.getElementById('log-message');
    const logBar = document.getElementById('log-bar');
    const statusDot = document.getElementById('status-dot');

    if (!logEl || !logBar) return;

    if (active) {
        isOffline = true;
        logQueue = []; 
        logEl.textContent = message;
        logEl.className = "text-red-400 font-bold";
        logBar.style.backgroundColor = '#7f1d1d';
        logEl.style.opacity = '1';
        if (statusDot) {
            statusDot.classList.remove('status-green');
            statusDot.classList.add('status-red');
        }
    } else {
        // Solo restauramos si realmente estábamos en modo offline
        if (isOffline) {
            isOffline = false;
            if (statusDot) {
                statusDot.classList.remove('status-red');
                statusDot.classList.add('status-green');
            }
            logStatus("✅ Conexión restaurada", "success");
        }
    }
}

/**
 * El Watchdog solo se activa si NO recibimos marketData
 */
function resetWatchdog() {
    // Si llega aquí, significa que hay flujo de datos, por lo tanto NO estamos offline
    if (isOffline) setInstantError(null, false);

    if (connectionWatchdog) clearTimeout(connectionWatchdog);

    connectionWatchdog = setTimeout(() => {
        // Si pasan 3 segundos sin datos, activamos alerta
        setInstantError("⚠️ ALERTA: Sin recepción de datos", true);
    }, 3000); 
}

function processNextLog() {
    if (isOffline || logQueue.length === 0) {
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
            if (!isOffline) {
                logEl.style.opacity = '0.5';
                processNextLog();
            }
        }, 2500);
    } else {
        isProcessingLog = false;
    }
}

export function logStatus(message, type = 'info') {
    logQueue.push({ message, type });
    if (!isProcessingLog && !isOffline) processNextLog();
}

export function initializeFullApp() {
    if (socket && socket.connected) return;

    socket = io(BACKEND_URL, { 
        path: '/socket.io', 
        transports: ['websocket'], 
        reconnection: true,
        reconnectionDelay: 1000
    });

    socket.on('connect', () => {
        // Al conectar, NO quitamos el error todavía. 
        // Esperamos a que llegue el primer marketData para asegurar que hay datos reales.
        socket.emit('get-bot-state');
    });

    socket.on('disconnect', () => {
        setInstantError("❌ Desconectado del servidor", true);
    });

    socket.on('bot-log', (log) => {
        logQueue.push(log);
        if (logQueue.length > 20) logQueue.shift();
        if (!isProcessingLog && !isOffline) processNextLog();
    });

    socket.on('marketData', (data) => {
        // RECIBIR DATOS ES LA PRUEBA REINA DE CONEXIÓN
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