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

// --- LÓGICA DE MONITOREO (WATCHDOG INTEGRADO EN LA BARRA) ---
let connectionWatchdog = null;

/**
 * Transforma la barra superior (LogBar/Nav) en una alerta de conexión
 */
function toggleConnectionAlert(show) {
    // Buscamos el elemento de la barra superior. 
    // Si tu barra tiene otro ID (como 'nav-bar'), cámbialo aquí abajo:
    const topBar = document.querySelector('nav') || document.getElementById('logBar');
    const statusText = document.getElementById('status-text'); // Si tienes un span de texto ahí

    if (show) {
        if (topBar) {
            topBar.classList.add('bg-red-600', 'animate-pulse');
            topBar.classList.remove('bg-gray-800', 'bg-black'); // Quitar colores originales
            
            // Opcional: Cambiar texto de estado si existe el elemento
            if (statusText) statusText.innerText = 'CONEXIÓN PERDIDA';
        }
    } else {
        if (topBar) {
            topBar.classList.remove('bg-red-600', 'animate-pulse');
            topBar.classList.add('bg-gray-800'); // Devolver color original
            
            if (statusText) statusText.innerText = 'SISTEMA ACTIVO';
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
            console.warn('⚠️ Watchdog: 2 segundos sin datos.');
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
        console.log('❌ Socket Desconectado');
        if (statusDot) statusDot.className = 'status-dot-base status-red';
        toggleConnectionAlert(true);
        if (connectionWatchdog) clearTimeout(connectionWatchdog);
    });

    socket.on('connect_error', (err) => {
        console.error('⚠️ Error de conexión:', err);
        if (statusDot) statusDot.className = 'status-dot-base status-red';
        toggleConnectionAlert(true);
    });

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