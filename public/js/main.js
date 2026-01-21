// public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI, updateControlsState } from './modules/uiManager.js'; 

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
            logQueue = []; 
            logStatus("✅ Conexión restaurada", "success");
        }
    } else {
        statusDot.classList.remove('status-green');
        statusDot.classList.add('status-red');
        if (!errorInterval) {
            logQueue = []; 
            const warningMsg = "⚠️ ALERTA: Sin recepción de datos";
            logStatus(warningMsg, "error"); 
            errorInterval = setInterval(() => {
                if (logQueue.length < 2) logStatus(warningMsg, "error");
            }, 2000); 
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

// --- GESTIÓN DE LOGS ---
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

        setTimeout(() => {
            if (logEl) logEl.style.opacity = '0.5';
            processNextLog();
        }, 1500); 
    } else {
        isProcessingLog = false;
    }
}

// --- INICIALIZACIÓN ---
export function initializeFullApp() {
    if (socket && socket.connected) return;

    // Aseguramos que el transporte sea WebSocket para evitar latencia
    socket = io(BACKEND_URL, { 
        path: '/socket.io', 
        transports: ['websocket'], 
        reconnection: true,
        reconnectionAttempts: 10
    });

    socket.on('connect', () => {
        updateConnectionStatus(true);
        // 🔥 IMPORTANTE: Al conectar, forzamos la carga del estado actual de la DB
        socket.emit('get-bot-state');
    });

    socket.on('disconnect', () => {
        updateConnectionStatus(false);
    });

    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data && data.price != null) {
            if (currentBotState.price !== data.price) {
                currentBotState.price = data.price;
                updateBotUI(currentBotState);
            }
        }
    });

    socket.on('bot-log', (log) => {
        logStatus(log.message, log.type);
    });

    // 🎯 EL MANDO ÚNICO DE ESTADO
    socket.on('bot-state-update', (state) => {
        resetWatchdog();
        if (state) {
            // Fusionamos el nuevo estado con el actual
            currentBotState = { ...currentBotState, ...state };
            
            console.log("📥 [SOCKET] Nuevo Estado Recibido:", {
                Long: currentBotState.lstate,
                Short: currentBotState.sstate
            });
            
            // Actualizamos TODA la interfaz
            updateBotUI(currentBotState); 
            updateControlsState(currentBotState); 
            
            logStatus("🔄 Interfaz sincronizada", "info");
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
                // Pasamos el estado actual para que la vista nazca con los datos correctos
                await module[initFnName](currentBotState); 
                updateBotUI(currentBotState);
                updateControlsState(currentBotState);
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