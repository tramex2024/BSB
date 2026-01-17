// public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI } from './modules/uiManager.js';

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';
export let socket = null;

// --- MEMORIA CENTRAL ---
export let currentBotState = {
    price: 0,
    sstate: 'STOPPED',
    lstate: 'STOPPED',
    config: {}
};

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),
    flujo: () => import('./modules/flujo.js'),
    aibot: () => import('./modules/aibot.js')
};

// --- LÓGICA DE MONITOREO (WATCHDOG EN EL LOG BAR) ---
let connectionWatchdog = null;

/**
 * Cambia el estilo del Log Bar cuando se pierde la conexión
 */
function toggleConnectionAlert(show) {
    // Buscamos el contenedor de logs. Ajusta el ID 'log-container' si es diferente en tu HTML
    const logBar = document.getElementById('log-container') || document.getElementById('log-bar');
    
    if (show) {
        if (logBar) {
            // Aplicamos rojo intenso y una sombra interna para que resalte
            logBar.style.transition = "all 0.3s ease";
            logBar.style.backgroundColor = "#991b1b"; // red-800
            logBar.style.border = "1px solid #ef4444"; // red-500
            logBar.classList.add('animate-pulse');
            
            // Opcional: Insertar un mensaje de error en el log si no existe ya
            if (!document.getElementById('reconnect-msg')) {
                const msg = document.createElement('p');
                msg.id = 'reconnect-msg';
                msg.className = 'text-white font-bold text-center py-1 bg-red-900/50 mb-2';
                msg.innerText = '⚠️ CONEXIÓN PERDIDA - ESPERANDO DATOS...';
                logBar.prepend(msg);
            }
        }
    } else {
        if (logBar) {
            // Restauramos los colores originales (asumiendo gris oscuro/negro)
            logBar.style.backgroundColor = ""; // Vuelve al CSS original
            logBar.style.border = "";
            logBar.classList.remove('animate-pulse');
            
            const msg = document.getElementById('reconnect-msg');
            if (msg) msg.remove();
        }
    }
}

function resetWatchdog() {
    const statusDot = document.getElementById('status-dot');
    
    if (statusDot && statusDot.classList.contains('status-red')) {
        statusDot.className = 'status-dot-base status-green';
        toggleConnectionAlert(false); 
    }

    if (connectionWatchdog) clearTimeout(connectionWatchdog);

    connectionWatchdog = setTimeout(() => {
        if (statusDot) {
            console.warn('⚠️ Watchdog: Sin actividad de red por 2 segundos.');
            statusDot.className = 'status-dot-base status-red';
            toggleConnectionAlert(true); 
        }
    }, 2000);
}

// --- INITIALIZE APP ---
export function initializeFullApp() {
    if (socket) return;

    const statusDot = document.getElementById('status-dot');

    socket = io(BACKEND_URL, { 
        path: '/socket.io', 
        transports: ['websocket'], 
        reconnection: true 
    });

    socket.on('connect', () => {
        console.log('✅ Socket Conectado');
        if (statusDot) statusDot.className = 'status-dot-base status-green';
        toggleConnectionAlert(false);
        resetWatchdog();
        socket.emit('get-bot-state');
    });

    socket.on('disconnect', () => {
        if (statusDot) statusDot.className = 'status-dot-base status-red';
        toggleConnectionAlert(true);
        if (connectionWatchdog) clearTimeout(connectionWatchdog);
    });

    socket.on('connect_error', () => {
        if (statusDot) statusDot.className = 'status-dot-base status-red';
        toggleConnectionAlert(true);
    });

    // --- ESCUCHAS DE DATOS ---
    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data?.price != null) {
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

    socket.on('balance-real-update', (data) => {
        resetWatchdog();
        if (data) {
            currentBotState.lastAvailableUSDT = data.lastAvailableUSDT;
            currentBotState.lastAvailableBTC = data.lastAvailableBTC;
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