// public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI } from './modules/uiManager.js';

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export let socket = null;

// --- MEMORIA CENTRAL (Estado Persistente) ---
export let currentBotState = {
    price: 0,
    sstate: 'STOPPED',
    lstate: 'STOPPED'
};

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),
    flujo: () => import('./modules/flujo.js'), // Asegúrate de que esta coma exista
    aibot: () => import('./modules/aibot.js')
};

export function initializeFullApp() {
    if (socket) return;

    socket = io(BACKEND_URL, { 
        path: '/socket.io', 
        transports: ['websocket'], 
        reconnection: true 
    });

    socket.on('connect', () => {
        console.log('✅ Socket Conectado');
        socket.emit('get-bot-state');
    });

    socket.on('marketData', (data) => {
        if (data && data.price != null) {
            // 1. Guardar en memoria siempre
            currentBotState.price = data.price;
            // 2. Intentar pintar la UI (si la pestaña actual tiene los IDs)
            updateBotUI({ price: data.price });
        }
    });

    // Escucha genérica para el estado del bot
    socket.on('bot-state-update', (state) => {
        if (state) {
            // Fusionamos los datos nuevos con la memoria existente
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
                await module[initFnName]();
                
                // --- SINCRONIZACIÓN INSTANTÁNEA ---
                // Al terminar de cargar cualquier pestaña, le pasamos lo que tenemos en memoria
                updateBotUI(currentBotState);
            }
        }
    } catch (error) {
        console.error("Error cargando vista:", error);
    }
}

// Inicio
document.addEventListener('DOMContentLoaded', () => {
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();
    if (localStorage.getItem('token')) {
        initializeFullApp();
    } else {
        initializeTab('dashboard');
    }
});