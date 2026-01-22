import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI, updateControlsState } from './modules/uiManager.js'; 

// --- CONFIGURACIÓN ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';

export const currentBotState = {
    price: 0,
    sstate: 'STOPPED',
    lstate: 'STOPPED',
    config: {}
};

export let socket = null;
export let intervals = {}; 

let logQueue = [];
let isProcessingLog = false;
let connectionWatchdog = null;

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),    
    aibot: () => import('./modules/aibot.js')
};

// --- GESTIÓN DE CONEXIÓN ---
function updateConnectionStatus(status) {
    const statusDot = document.getElementById('status-dot');
    if (!statusDot) return;
    statusDot.classList.remove('status-red', 'status-green', 'status-purple');

    if (status === 'CONNECTED') {
        statusDot.classList.add('status-green');
    } else {
        statusDot.classList.add('status-red');
    }
}

function resetWatchdog() {
    updateConnectionStatus('CONNECTED');
    if (connectionWatchdog) clearTimeout(connectionWatchdog);
    connectionWatchdog = setTimeout(() => {
        updateConnectionStatus('DISCONNECTED');
    }, 5000);
}

export function logStatus(message, type = 'info') {
    logQueue.push({ message, type });
    if (!isProcessingLog) processNextLog();
}

function processNextLog() {
    if (logQueue.length === 0) { isProcessingLog = false; return; }
    const logEl = document.getElementById('log-message');
    if (!logEl) return;

    isProcessingLog = true;
    const log = logQueue.shift();
    logEl.textContent = log.message;
    
    const colors = { success: 'text-emerald-400', error: 'text-red-400', warning: 'text-yellow-400', info: 'text-blue-400' };
    logEl.className = `transition-opacity duration-300 font-medium ${colors[log.type] || 'text-gray-400'}`;
    
    setTimeout(() => { processNextLog(); }, 2500);
}

// Dentro de la función initializeFullApp en main.js

export function initializeFullApp() {
    if (socket && socket.connected) return;

    // Usamos la configuración de transporte que pide tu Server.js
    socket = io(BACKEND_URL, { 
        path: '/socket.io',
        transports: ['websocket', 'polling'], 
        credentials: true
    });

    socket.on('connect', () => {
        updateConnectionStatus('CONNECTED');
        logStatus("✅ Conexión con el servidor establecida", "success");
        // Solicitamos el estado inmediatamente al conectar
        socket.emit('get-bot-state');
    });

    // --- ESCUCHA DE PRECIOS EN TIEMPO REAL ---
    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data && data.price) {
            currentBotState.price = parseFloat(data.price);
            // IMPORTANTE: Llamamos a updateBotUI para que el precio cambie en pantalla
            updateBotUI(currentBotState); 
        }
    });

    // --- ESCUCHA DE ESTADO DEL BOT (Botones y Ciclos) ---
    socket.on('bot-state-update', (state) => {
        if (state) {
            Object.assign(currentBotState, state); 
            updateBotUI(currentBotState); 
            updateControlsState(currentBotState); 
            console.log("🔄 Estado del bot actualizado:", state.lstate);
        }
    });

    socket.on('disconnect', () => {
        updateConnectionStatus('DISCONNECTED');
        logStatus("❌ Conexión perdida con el servidor", "error");
    });
}

// --- GESTIÓN DE PESTAÑAS ---
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
                await module[initFnName](currentBotState); 
                // Renderizado inmediato al cambiar de pestaña
                updateBotUI(currentBotState);
                updateControlsState(currentBotState);
            }
        }
    } catch (error) { 
        console.error("❌ Error cargando vista:", error); 
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // IMPORTANTE: Le pasamos la función initializeTab para que navigation.js sepa cómo cargar contenido
    setupNavTabs(initializeTab); 
    
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();
    
    // Ya no necesitas cargar la pestaña inicial aquí manualmente, 
    // porque navigation.js ya lo hace al final de su código.
});