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

    if (!logEl || !logBar || !statusDot) return;

    if (active) {
        // MODO ERROR: Bloqueamos y mostramos alerta roja fija
        isOffline = true;
        logQueue = []; // Limpiamos cola para que no haya basura acumulada
        logEl.textContent = message;
        logEl.className = "text-red-400 font-bold";
        logBar.style.backgroundColor = '#7f1d1d';
        logEl.style.opacity = '1';
        
        statusDot.classList.remove('status-green');
        statusDot.classList.add('status-red');
    } else {
        // MODO RESTAURACIÓN: Solo si estábamos en error
        if (isOffline) {
            isOffline = false;
            statusDot.classList.remove('status-red');
            statusDot.classList.add('status-green');
            
            // Enviamos el mensaje de éxito a través del sistema de logs 
            // para que se borre solo después de 2.5 segundos
            logStatus("✅ Conexión restaurada", "success");
        } else {
            // Asegurar verde en inicio normal
            statusDot.classList.remove('status-red');
            statusDot.classList.add('status-green');
        }
    }
}

function resetWatchdog() {
    // Si entran datos, quitamos el error inmediatamente
    if (isOffline) setInstantError(null, false);

    if (connectionWatchdog) clearTimeout(connectionWatchdog);

    connectionWatchdog = setTimeout(() => {
        setInstantError("⚠️ ALERTA: Sin recepción de datos", true);
    }, 3000); 
}

function processNextLog() {
    // Si estamos en offline, no procesamos logs normales (la alerta roja manda)
    if (isOffline) {
        isProcessingLog = false;
        return;
    }

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

        // Mantener el log visible 2.5 segundos y luego procesar el siguiente
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
    // Si el procesador estaba dormido, lo despertamos
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
        // La bolita se pone verde, pero no quitamos el log hasta que llegue marketData
        const statusDot = document.getElementById('status-dot');
        if (statusDot) {
            statusDot.classList.remove('status-red');
            statusDot.classList.add('status-green');
        }
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
        resetWatchdog(); // Esto apagará el error y lanzará "Conexión restaurada"
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