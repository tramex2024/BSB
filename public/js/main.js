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

let lastPrice = 0; // Para el comparador de color del precio
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

    socket = io(BACKEND_URL, { 
        path: '/socket.io', 
        transports: ['websocket'], 
        reconnection: true,
        reconnectionAttempts: 10
    });

    socket.on('connect', () => {
        updateConnectionStatus(true);
        socket.emit('get-bot-state');
    });

    socket.on('disconnect', () => {
        updateConnectionStatus(false);
    });

    // ACTUALIZACIÓN DE PRECIO QUIRÚRGICA
    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data && data.price != null) {
            const newPrice = parseFloat(data.price);
            if (currentBotState.price !== newPrice) {
                currentBotState.price = newPrice;
                
                // Solo actualizamos el elemento visual del precio para no estresar el DOM
                const auPriceEl = document.getElementById('auprice');
                if (auPriceEl) {
                    const formatter = new Intl.NumberFormat('en-US', {
                        style: 'currency', currency: 'USD',
                        minimumFractionDigits: 2, maximumFractionDigits: 2
                    });
                    auPriceEl.textContent = formatter.format(newPrice);
                    
                    // Lógica de color de la versión funcional
                    if (lastPrice > 0) {
                        auPriceEl.style.setProperty('color', newPrice > lastPrice ? '#34d399' : (newPrice < lastPrice ? '#f87171' : '#ffffff'), 'important');
                    }
                }
                lastPrice = newPrice;
            }
        }
    });

    socket.on('bot-log', (log) => {
        logStatus(log.message, log.type);
    });

    // 🎯 MANDO ÚNICO DE ESTADO (Sincronización Reactiva)
    socket.on('bot-state-update', (state) => {
        resetWatchdog();
        if (state) {
            // Fusionamos el nuevo estado asegurando la persistencia
            currentBotState = { ...currentBotState, ...state };
            
            console.log("📥 [SOCKET] Sincronización de Estado:", {
                Long: currentBotState.lstate,
                Short: currentBotState.sstate
            });
            
            // Sincronización mandatoria de toda la UI (Solo cuando cambia el estado real)
            updateBotUI(currentBotState); 
            updateControlsState(currentBotState); 
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