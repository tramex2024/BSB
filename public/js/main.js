// public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI } from './modules/uiManager.js';

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export let socket = null;

// --- MEMORIA CENTRAL (Estado Persistente) ---
// Aquí es donde vive la "verdad" de tu bot mientras navegas
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

/**
 * Inicializa la conexión y los escuchas de eventos globales
 */
export function initializeFullApp() {
    if (socket) return;

    socket = io(BACKEND_URL, { 
        path: '/socket.io', 
        transports: ['websocket'], 
        reconnection: true 
    });

    socket.on('connect', () => {
        console.log('✅ Socket Conectado');
        // Pedimos el estado inicial al conectar
        socket.emit('get-bot-state');
    });

    // Escucha de Precios (Alta frecuencia)
    socket.on('marketData', (data) => {
        if (data && data.price != null) {
            // Actualizamos memoria
            currentBotState.price = data.price;
            
            // Actualizamos la UI con el estado completo para mantener coherencia
            updateBotUI(currentBotState);
        }
    });

    // Escucha de cambios en el Bot (Estados, balances, config)
    socket.on('bot-state-update', (state) => {
        if (state) {
            // Fusionamos de forma atómica: lo que ya tenemos + lo que llega nuevo
            currentBotState = { ...currentBotState, ...state };
            
            console.log("📡 Memoria Actualizada:", currentBotState);
            updateBotUI(currentBotState);
        }
    });

    // Escucha de balances reales
    socket.on('balance-real-update', (data) => {
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
        // 1. Cargamos el HTML de la pestaña
        const response = await fetch(`./${tabName}.html`);
        const html = await response.text();
        mainContent.innerHTML = html;

        // 2. Cargamos e inicializamos el JS de la pestaña
        if (views[tabName]) {
            const module = await views[tabName]();
            const initFnName = `initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`;
            
            if (typeof module[initFnName] === 'function') {
    // IMPORTANTE: Pasamos currentBotState aquí
    await module[initFnName](currentBotState); 
    
    // Refuerzo para que uiManager también intente pintar
    updateBotUI(currentBotState);
}
        }
    } catch (error) {
        console.error("❌ Error cargando vista:", error);
    }
}

// Arranque inicial de la aplicación
document.addEventListener('DOMContentLoaded', () => {
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();

    // Si hay sesión iniciada, arrancamos el flujo de datos
    if (localStorage.getItem('token')) {
        initializeFullApp();
    } else {
        // Si no, enviamos al dashboard (login)
        initializeTab('dashboard');
    }
});