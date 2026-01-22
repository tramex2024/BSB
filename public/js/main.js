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

// --- INICIALIZACIÓN DE SOCKETS ---
export function initializeFullApp() {
    if (socket && socket.connected) return;

    if (typeof io === 'undefined') return;

    socket = io(BACKEND_URL, { 
        transports: ['websocket', 'polling'], // Añadimos polling por si acaso
        reconnection: true 
    });

    socket.on('connect', () => {
        updateConnectionStatus('CONNECTED');
        logStatus("✅ Servidor conectado", "success");
        socket.emit('get-bot-state');
    });

    // === AGREGAR ESTO PARA EL PRECIO ===
    socket.on('marketData', (data) => {
        resetWatchdog(); // Esto mantiene la bolita verde
        if (data && data.price) {
            currentBotState.price = parseFloat(data.price);
            updateBotUI(currentBotState); // Esta función dibuja el precio en pantalla
        }
    });
    // ===================================

    socket.on('bot-state-update', (state) => {
        resetWatchdog();
        if (state) {
            Object.assign(currentBotState, state); 
            updateBotUI(currentBotState); 
            updateControlsState(currentBotState); 
            console.log("🔄 UI Sincronizada:", state.lstate, state.sstate);
        }
    });

    socket.on('disconnect', () => updateConnectionStatus('DISCONNECTED'));
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
                // 1. Iniciamos la lógica de la vista
                await module[initFnName](currentBotState); 
                
                // 2. IMPORTANTE: Pedimos al servidor los datos de la DB inmediatamente
                if (socket && socket.connected) {
                    console.log(`Solicitando estado para la pestaña: ${tabName}`);
                    socket.emit('get-bot-state'); 
                }
            }
        }
    } catch (error) { 
        console.error("❌ Error cargando vista:", error); 
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Le pasamos initializeTab para que sepa cómo cambiar de página
    setupNavTabs(initializeTab); 
    
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();
    
    if (localStorage.getItem('token')) { 
        initializeFullApp(); 
        initializeTab('autobot'); 
    } else { 
        initializeTab('dashboard'); 
    }
});