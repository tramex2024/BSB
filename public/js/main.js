// public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI } from './modules/uiManager.js';

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';

export let socket = null;
export let intervals = {};

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),
    aibot: () => import('./modules/aibot.js')
    flujo: () => import('./modules/flujo.js')
};

function updateConnectionStatusBall(status) {
    const statusDot = document.getElementById('status-dot');
    if (!statusDot) return;
    statusDot.className = 'status-dot-base';
    const classes = { 'CONNECTED': 'status-green', 'DISCONNECTED': 'status-red', 'CACHE': 'status-purple' };
    statusDot.classList.add(classes[status] || 'status-red');
}

export function initializeFullApp() {
    if (socket) return;
    socket = io(BACKEND_URL, { path: '/socket.io', transports: ['websocket'], reconnection: true });

    socket.on('connect', () => {
        console.log('✅ Real-time: Connected');
        updateConnectionStatusBall('CONNECTED');
        socket.emit('get-bot-state');
    });

    socket.on('disconnect', () => { updateConnectionStatusBall('DISCONNECTED'); });

    socket.on('bot-state-update', (state) => {
        if (state) {
            console.log("📡 State Update:", state);
            updateBotUI(state);
        }
    });

    socket.on('marketData', (data) => {
    if (data && data.price != null) {
        currentBotState.price = data.price; // Guardar en memoria
        updateBotUI(currentBotState);      // Intentar actualizar si la pestaña está abierta
    }

    socket.on('balance-real-update', (data) => {
        if (data.source === 'CACHE_FALLBACK') updateConnectionStatusBall('CACHE');
        updateBotUI({ lastAvailableUSDT: data.lastAvailableUSDT, lastAvailableBTC: data.lastAvailableBTC });
    });

    setupNavTabs(initializeTab);
}



// En la parte superior de tu main.js actual
export let globalState = {
    price: 0
};
// Memoria central de la aplicación
export let currentBotState = {
    price: 0
};



// Dentro de tu socket.on('marketData')
socket.on('marketData', (data) => {
    if (data && data.price) {
        globalState.price = data.price; // Guardamos en memoria
        updateBotUI({ price: data.price }); // Intentamos actualizar la UI
    }
});

export async function initializeTab(tabName) {
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
                await module[initFnName]();
                if (socket && socket.connected) {
                    socket.emit('get-bot-state'); // REFRESCAR DATOS TRAS CARGA
                }
            }
        }
    } catch (error) {
        console.error("Error cargando vista:", error);
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