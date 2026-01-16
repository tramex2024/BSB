// public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI } from './modules/uiManager.js';

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';

export let socket = null;
export let intervals = {};

// Gestión de Vistas
const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),
    aibot: () => import('./modules/aibot.js')
};

/**
 * Actualiza la bolita de estado de forma atómica
 */
function updateConnectionStatusBall(status) {
    const statusDot = document.getElementById('status-dot');
    if (!statusDot) return;
    
    // Reset de clases
    statusDot.className = 'status-dot-base';
    
    const classes = {
        'CONNECTED': 'status-green',
        'DISCONNECTED': 'status-red',
        'CACHE': 'status-purple'
    };
    
    statusDot.classList.add(classes[status] || 'status-red');
}

/**
 * Inicializa el Socket UNA SOLA VEZ
 */
export function initializeFullApp() {
    if (socket) return; // Si ya existe, no hacemos nada

    socket = io(BACKEND_URL, { 
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: true
    });

    socket.on('connect', () => {
        console.log('✅ Real-time: Connected');
        updateConnectionStatusBall('CONNECTED');
        socket.emit('get-bot-state');
    });

    socket.on('disconnect', () => {
        updateConnectionStatusBall('DISCONNECTED');
    });

    // --- ESCUCHA ÚNICA DE DATOS ---
    socket.on('bot-state-update', (state) => {
    if (state) {
        // Log de debug para ver si sstate llega como 'RUNNING' o 'STOPPED'
        console.log("📡 State Update:", { s: state.sstate, price: state.price });
        updateBotUI(state);
    }
});

    socket.on('marketData', (data) => {
    // Validamos que el precio sea un número real antes de enviarlo a la UI
    if (data && data.price != null) {
        updateBotUI({ price: data.price });
    }
    
    if (data.exchangeOnline === false) updateConnectionStatusBall('DISCONNECTED');
    else if (data.exchangeOnline === true) updateConnectionStatusBall('CONNECTED');
});

    socket.on('balance-real-update', (data) => {
        if (data.source === 'CACHE_FALLBACK') updateConnectionStatusBall('CACHE');
        updateBotUI({
            lastAvailableUSDT: data.lastAvailableUSDT,
            lastAvailableBTC: data.lastAvailableBTC
        });
    });

    // Inicializar navegación pasándole la función de carga
    setupNavTabs(initializeTab);
}

/**
 * Carga de Vistas sin duplicar Listeners
 */
export async function initializeTab(tabName) {
    // Limpieza de intervalos viejos
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
                console.log(`📍 Cambiando a: ${tabName}`);
                await module[initFnName]();
            }
        }
    } catch (error) {
        console.error("Error cargando vista:", error);
    }
}

// Arranque inicial
document.addEventListener('DOMContentLoaded', () => {
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();

    if (localStorage.getItem('token')) {
        initializeFullApp();
    } else {
        initializeTab('dashboard');
    }
});