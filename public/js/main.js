import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI, updateControlsState } from './modules/uiManager.js'; 

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';

export let socket = null;
export let intervals = {}; // IMPORTANTE: Recuperado del funcional para evitar fugas de memoria

export let currentBotState = {
    price: 0,
    sstate: 'STOPPED',
    lstate: 'STOPPED',
    config: {}
};

let lastPrice = 0;
let logQueue = [];
let isProcessingLog = false;
let connectionWatchdog = null;
let errorInterval = null;

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),    
    aibot: () => import('./modules/aibot.js')
};

// --- GESTIÓN DE CONEXIÓN (Estilo Semáforo del Funcional + Watchdog) ---
function updateConnectionStatus(status) {
    const statusDot = document.getElementById('status-dot');
    if (!statusDot) return;

    // Limpiamos clases previas
    statusDot.classList.remove('status-red', 'status-green', 'status-purple');

    if (status === 'CONNECTED' || status === 'API_SUCCESS') {
        statusDot.classList.add('status-green');
        if (errorInterval) {
            clearInterval(errorInterval);
            errorInterval = null;
            logStatus("✅ Conexión restaurada", "success");
        }
    } else if (status === 'DISCONNECTED') {
        statusDot.classList.add('status-red');
        if (!errorInterval) {
            logStatus("⚠️ ALERTA: Sin recepción de datos", "error");
            errorInterval = setInterval(() => logStatus("⚠️ ALERTA: Sin recepción de datos", "error"), 5000);
        }
    }
}

function resetWatchdog() {
    updateConnectionStatus('CONNECTED');
    if (connectionWatchdog) clearTimeout(connectionWatchdog);
    connectionWatchdog = setTimeout(() => {
        updateConnectionStatus('DISCONNECTED');
    }, 3500);
}

// --- GESTIÓN DE LOGS (Optimizado 2.5s como el funcional) ---
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

    if (logEl) {
        logEl.textContent = log.message;
        const colors = { success: 'text-emerald-400', error: 'text-red-400', warning: 'text-yellow-400', info: 'text-blue-400' };
        logEl.className = `transition-opacity duration-300 font-medium ${colors[log.type] || 'text-gray-400'}`;
        if (logBar) logBar.style.backgroundColor = log.type === 'error' ? '#7f1d1d' : '#111827';
        logEl.style.opacity = '1';

        setTimeout(() => {
            logEl.style.opacity = '0.5';
            processNextLog();
        }, 2500); // Sincronizado con el funcional
    } else {
        isProcessingLog = false;
    }
}

// --- INICIALIZACIÓN DE SOCKETS (Inyectando canales del funcional) ---
export function initializeFullApp() {
    if (socket && socket.connected) return;

    socket = io(BACKEND_URL, { 
        path: '/socket.io', 
        transports: ['websocket'], 
        reconnection: true,
        reconnectionAttempts: 10
    });

    socket.on('connect', () => {
        updateConnectionStatus('CONNECTED');
        socket.emit('get-bot-state');
    });

    socket.on('disconnect', () => updateConnectionStatus('DISCONNECTED'));

    // 1. Canal de Precios
    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data && data.price != null) {
            const newPrice = parseFloat(data.price);
            if (currentBotState.price !== newPrice) {
                currentBotState.price = newPrice;
                const auPriceEl = document.getElementById('auprice');
                if (auPriceEl) {
                    const formatter = new Intl.NumberFormat('en-US', {
                        style: 'currency', currency: 'USD',
                        minimumFractionDigits: 2, maximumFractionDigits: 2
                    });
                    auPriceEl.textContent = formatter.format(newPrice);
                    if (lastPrice > 0) {
                        auPriceEl.style.color = newPrice > lastPrice ? '#34d399' : (newPrice < lastPrice ? '#f87171' : '#ffffff');
                    }
                }
                lastPrice = newPrice;
            }
        }
    });

    // 2. Canal de Estado (Mando Único)
    socket.on('bot-state-update', (state) => {
        resetWatchdog();
        if (state) {
            currentBotState = { ...currentBotState, ...state };
            updateBotUI(currentBotState); 
            updateControlsState(currentBotState); 
        }
    });

    // 3. Canal de Balances (Recuperado del funcional)
    socket.on('balance-real-update', (data) => {
        const elements = {
            'aubalance-usdt': parseFloat(data.lastAvailableUSDT || 0).toFixed(2),
            'aubalance-btc': parseFloat(data.lastAvailableBTC || 0).toFixed(6),
        };
        Object.entries(elements).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        });
    });

    // 4. Canal de Logs
    socket.on('bot-log', (log) => {
        logStatus(log.message, log.type);
    });

    setupNavTabs(initializeTab);
}

// --- GESTIÓN DE PESTAÑAS (Limpieza de memoria del funcional) ---
export async function initializeTab(tabName) {
    // Limpieza de intervalos activos (Vital para que no se pise el código)
    Object.values(intervals).forEach(clearInterval);
    intervals = {};

    // Limpieza de gráficos (Si existe chart.js en la ventana)
    if (window.currentChart && typeof window.currentChart.remove === 'function') {
        window.currentChart.remove();
        window.currentChart = null;
    }

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