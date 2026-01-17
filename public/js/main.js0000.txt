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

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),    
    aibot: () => import('./modules/aibot.js')
};

// --- LÓGICA DE MONITOREO (WATCHDOG) ---
let connectionWatchdog = null;

/**
 * Reinicia el temporizador de seguridad. 
 * Si no se llama en 2 segundos, la bolita se pone roja.
 */
function resetWatchdog() {
    const statusDot = document.getElementById('status-dot');
    
    // Si recibimos datos y estaba en rojo, lo devolvemos a verde
    if (statusDot && statusDot.classList.contains('status-red')) {
        statusDot.className = 'status-dot-base status-green';
    }

    // Limpiar el temporizador anterior
    if (connectionWatchdog) clearTimeout(connectionWatchdog);

    // Iniciar nueva cuenta regresiva de 2 segundos
    connectionWatchdog = setTimeout(() => {
        if (statusDot) {
            console.warn('⚠️ Watchdog: Sin datos detectados en 2 segundos.');
            statusDot.className = 'status-dot-base status-red';
        }
    }, 2000);
}

/**
 * Inicializa la conexión y los escuchas de eventos globales
 */
export function initializeFullApp() {
    if (socket) return;

    const statusDot = document.getElementById('status-dot');

    socket = io(BACKEND_URL, { 
        path: '/socket.io', 
        transports: ['websocket'], 
        reconnection: true 
    });

    // --- EVENTOS DE CONEXIÓN ---
    socket.on('connect', () => {
        console.log('✅ Socket Conectado');
        if (statusDot) {
            statusDot.className = 'status-dot-base status-green';
        }
        resetWatchdog(); // Iniciar el monitoreo al conectar
        socket.emit('get-bot-state');
    });

    socket.on('disconnect', () => {
        console.log('❌ Socket Desconectado');
        if (statusDot) {
            statusDot.className = 'status-dot-base status-red';
        }
        if (connectionWatchdog) clearTimeout(connectionWatchdog);
    });

    socket.on('connect_error', (err) => {
        console.error('⚠️ Error de conexión:', err);
        if (statusDot) {
            statusDot.className = 'status-dot-base status-red';
        }
    });

    // --- ESCUCHAS DE DATOS (Cada uno alimenta al Watchdog) ---
    
    socket.on('marketData', (data) => {
        resetWatchdog(); // Datos de mercado recibidos
        if (data && data.price != null) {
            currentBotState.price = data.price;
            updateBotUI(currentBotState);
        }
    });

    socket.on('bot-state-update', (state) => {
        resetWatchdog(); // Actualización de estado recibida
        if (state) {
            currentBotState = { ...currentBotState, ...state };
            console.log("📡 Memoria Actualizada:", currentBotState);
            updateBotUI(currentBotState);
        }
    });

    socket.on('balance-real-update', (data) => {
        resetWatchdog(); // Datos de balance recibidos
        if (data) {
            currentBotState.lastAvailableUSDT = data.lastAvailableUSDT;
            currentBotState.lastAvailableBTC = data.lastAvailableBTC;
            updateBotUI(currentBotState);
        }
    });

    setupNavTabs(initializeTab);
}

/**
 * Gestiona el cambio de pestañas sin perder los datos de la memoria
 */
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
                console.log(`🖼️ Vista ${tabName} sincronizada.`);
            }
        }
    } catch (error) {
        console.error("❌ Error cargando vista:", error);
    }
}

// Arranque
document.addEventListener('DOMContentLoaded', () => {
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();

    if (localStorage.getItem('token')) {
        initializeFullApp();
    } else {
        initializeTab('dashboard');
    }
});