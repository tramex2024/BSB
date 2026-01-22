import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotUI, updateControlsState } from './modules/uiManager.js'; 

// --- CONFIGURACIÓN ---
export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';

// Usamos un objeto constante para mantener la referencia siempre viva
export const currentBotState = {
    price: 0,
    sstate: 'STOPPED',
    lstate: 'STOPPED',
    config: {}
};

export let socket = null;
export let intervals = {}; 

let lastPrice = 0;
let logQueue = [];
let isProcessingLog = false;
let connectionWatchdog = null;
let errorInterval = null;

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
        if (errorInterval) {
            clearInterval(errorInterval);
            errorInterval = null;
            logStatus("✅ Conexión restaurada", "success");
        }
    } else if (status === 'DISCONNECTED') {
        statusDot.classList.add('status-red');
        if (!errorInterval) {
            logStatus("⚠️ ALERTA: Sin recepción de datos", "error");
            // Evitamos spam de logs con un intervalo más largo
            errorInterval = setInterval(() => logStatus("⚠️ Reintentando conexión...", "warning"), 10000);
        }
    }
}

function resetWatchdog() {
    updateConnectionStatus('CONNECTED');
    if (connectionWatchdog) clearTimeout(connectionWatchdog);
    // Aumentado a 5s para evitar falsos negativos por latencia de red
    connectionWatchdog = setTimeout(() => {
        updateConnectionStatus('DISCONNECTED');
    }, 5000);
}

// --- GESTIÓN DE LOGS (Mejorada para evitar bloqueos) ---
export function logStatus(message, type = 'info') {
    if (logQueue.length > 30) logQueue.shift(); 
    logQueue.push({ message, type });
    if (!isProcessingLog) processNextLog();
}

function processNextLog() {
    if (logQueue.length === 0) {
        isProcessingLog = false;
        return;
    }

    const logEl = document.getElementById('log-message');
    if (!logEl) {
        isProcessingLog = false;
        return;
    }

    isProcessingLog = true;
    const log = logQueue.shift();
    const logBar = document.getElementById('log-bar');

    logEl.textContent = log.message;
    const colors = { 
        success: 'text-emerald-400', 
        error: 'text-red-400', 
        warning: 'text-yellow-400', 
        info: 'text-blue-400' 
    };
    
    logEl.className = `transition-opacity duration-300 font-medium ${colors[log.type] || 'text-gray-400'}`;
    if (logBar) logBar.style.backgroundColor = log.type === 'error' ? '#7f1d1d' : '#111827';
    logEl.style.opacity = '1';

    setTimeout(() => {
        logEl.style.opacity = '0.5';
        processNextLog();
    }, 2500);
}

// --- INICIALIZACIÓN DE SOCKETS ---
export function initializeFullApp() {
    // Evita duplicar conexiones
    if (socket && socket.connected) return;

    // Asegúrate de que io esté disponible (Socket.io Client)
    if (typeof io === 'undefined') {
        console.error("Socket.io no está cargado.");
        return;
    }

    socket = io(BACKEND_URL, { 
        path: '/socket.io', 
        transports: ['websocket'], 
        reconnection: true,
        reconnectionAttempts: 10,
        timeout: 10000
    });

    socket.on('connect', () => {
        updateConnectionStatus('CONNECTED');
        socket.emit('get-bot-state');
    });

    socket.on('disconnect', () => updateConnectionStatus('DISCONNECTED'));

    socket.on('marketData', (data) => {
        resetWatchdog();
        if (data?.price != null) {
            const newPrice = parseFloat(data.price);
            if (currentBotState.price !== newPrice) {
                currentBotState.price = newPrice;
                renderPrice(newPrice);
            }
        }
    });

    // En initializeFullApp dentro de main.js
socket.on('bot-state-update', (state) => {
    resetWatchdog();
    if (state) {
        // 1. Actualizamos el estado global
        Object.assign(currentBotState, state); 
        
        // 2. Forzamos la actualización de la UI informativa (precios/números)
        updateBotUI(currentBotState); 
        
        // 3. Forzamos la actualización de los BOTONES (Esto es lo que te falta)
        updateControlsState(currentBotState); 
        
        console.log("🔄 Interfaz sincronizada con el estado del servidor:", state);
    }
});

// Función auxiliar para no ensuciar el socket listener
function renderPrice(newPrice) {
    const auPriceEl = document.getElementById('auprice');
    if (!auPriceEl) return;

    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD',
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    
    auPriceEl.textContent = formatter.format(newPrice);
    if (lastPrice > 0) {
        auPriceEl.style.color = newPrice > lastPrice ? '#34d399' : (newPrice < lastPrice ? '#f87171' : '#ffffff');
    }
    lastPrice = newPrice;
}

// --- GESTIÓN DE PESTAÑAS ---
export async function initializeTab(tabName) {
    // Limpieza profunda de intervalos
    Object.values(intervals).forEach(clearInterval);
    intervals = {};

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    try {
        const response = await fetch(`./${tabName}.html`);
        if (!response.ok) throw new Error("No se pudo cargar el HTML");
        const html = await response.text();
        mainContent.innerHTML = html;
        
        if (views[tabName]) {
            const module = await views[tabName]();
            const initFnName = `initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`;
            
            if (typeof module[initFnName] === 'function') {
                // Pasamos el estado actual a la vista
                await module[initFnName](currentBotState); 
                updateBotUI(currentBotState);
                updateControlsState(currentBotState);
            }
        }
    } catch (error) { 
        console.error("❌ Error cargando vista:", error); 
        logStatus("Error al cargar la vista", "error");
    }
}

// Inicio de la app
document.addEventListener('DOMContentLoaded', () => {
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();
    
    if (localStorage.getItem('token')) { 
        initializeFullApp(); 
    } else { 
        initializeTab('dashboard'); 
    }
});