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
    flujo: () => import('./modules/flujo.js'),
    aibot: () => import('./modules/aibot.js')
};

// --- LÓGICA DE MONITOREO (WATCHDOG + ALERTA VISUAL) ---
let connectionWatchdog = null;

/**
 * Muestra u oculta un banner rojo de advertencia en la parte superior
 */
function toggleConnectionAlert(show) {
    let alertBox = document.getElementById('connection-alert');
    
    if (show) {
        if (!alertBox) {
            alertBox = document.createElement('div');
            alertBox.id = 'connection-alert';
            alertBox.className = 'fixed top-0 left-0 w-full z-[9999]';
            alertBox.innerHTML = `
                <div class="bg-red-600 text-white text-[10px] font-bold py-1.5 text-center animate-pulse uppercase tracking-widest shadow-xl">
                    ⚠️ Conexión interrumpida - Esperando datos del servidor...
                </div>`;
            document.body.appendChild(alertBox);
        }
    } else {
        if (alertBox) alertBox.remove();
    }
}

/**
 * Reinicia el temporizador de vida. Si pasan 2 seg sin datos, activa la alerta.
 */
function resetWatchdog() {
    const statusDot = document.getElementById('status-dot');
    
    // Si recibimos datos, normalizamos la interfaz
    if (statusDot && statusDot.classList.contains('status-red')) {
        statusDot.className = 'status-dot-base status-green';
        toggleConnectionAlert(false); 
    }

    // Limpiar temporizador previo
    if (connectionWatchdog) clearTimeout(connectionWatchdog);

    // Iniciar nueva cuenta regresiva de 2000ms
    connectionWatchdog = setTimeout(() => {
        if (statusDot) {
            console.warn('⚠️ Watchdog disparado: 2 segundos sin recibir actualizaciones.');
            statusDot.className = 'status-dot-base status-red';
            toggleConnectionAlert(true); // Mostrar el banner rojo
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
        toggleConnectionAlert(false);
        resetWatchdog(); 
        socket.emit('get-bot-state');
    });

    socket.on('disconnect', (reason) => {
        console.log('❌ Socket Desconectado:', reason);
        if (statusDot) {
            statusDot.className = 'status-dot-base status-red';
        }
        toggleConnectionAlert(true);
        if (connectionWatchdog) clearTimeout(connectionWatchdog);
    });

    socket.on('connect_error', (err) => {
        console.error('⚠️ Error de conexión:', err);
        if (statusDot) {
            statusDot.className = 'status-dot-base status-red';
        }
        toggleConnectionAlert(true);
    });

    // --- ESCUCHAS DE DATOS (Alimentan al Watchdog) ---
    
    socket.on('marketData', (data) => {
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
            console.log("📡 Memoria Actualizada:", currentBotState);
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
                // Sincronización inmediata pasando la memoria
                await module[initFnName](currentBotState); 
                updateBotUI(currentBotState);
                console.log(`🖼️ Vista ${tabName} sincronizada.`);
            }
        }
    } catch (error) {
        console.error("❌ Error cargando vista:", error);
    }
}

// --- ARRANQUE INICIAL ---
document.addEventListener('DOMContentLoaded', () => {
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();

    if (localStorage.getItem('token')) {
        initializeFullApp();
    } else {
        initializeTab('dashboard');
    }
});