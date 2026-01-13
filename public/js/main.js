// public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotBalances } from './modules/balance.js';
import { updateBotUI } from './modules/uiManager.js';

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';

export let currentChart = null;
export let intervals = {};
export let socket = null;

// --- VARIABLES PARA LOGS ---
let logQueue = [];
let isProcessingLog = false;

// Registro de módulos para carga dinámica
const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),
    aibot: () => import('./modules/aibot.js')
};

/**
 * Sistema de gestión de Logs con retardo (Anti-Spam)
 */
function processNextLog() {
    if (logQueue.length === 0) {
        isProcessingLog = false;
        return;
    }

    isProcessingLog = true;
    const log = logQueue.shift();
    const logEl = document.getElementById('log-message');

    if (logEl) {
        logEl.textContent = log.message;
        
        const colors = {
            success: 'text-emerald-400',
            error: 'text-red-400',
            warning: 'text-yellow-400',
            info: 'text-blue-400'
        };
        
        logEl.className = `transition-opacity duration-300 font-medium ${colors[log.type] || 'text-gray-400'}`;        
logEl.style.opacity = '0'; // Primero lo ocultamos
setTimeout(() => {
    logEl.textContent = log.message;
    logEl.style.opacity = '1'; // Aparece suavemente con el CSS nuevo
}, 50);
    } else {
        isProcessingLog = false;
    }
}

/**
 * Actualiza el indicador visual de conexión
 */
function updateConnectionStatusBall(source) {
    const statusDot = document.getElementById('status-dot'); 
    if (!statusDot) return;
    
    statusDot.className = 'status-dot transition-all duration-500 h-full w-full rounded-full block'; 

    switch (source) {
        case 'API_SUCCESS':
            statusDot.classList.add('status-green');
            break;
        case 'CACHE_FALLBACK':
            statusDot.classList.add('status-purple');
            break;
        default:
            statusDot.classList.add('status-red');
    }
}

/**
 * CARGA UNIFICADA DE VISTAS
 */
export async function initializeTab(tabName) {
    Object.values(intervals).forEach(clearInterval);
    intervals = {};
    
    if (window.currentChart && typeof window.currentChart.remove === 'function') {
        window.currentChart.remove();
        window.currentChart = null;
    }

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    mainContent.style.opacity = '0.5';

    try {
        const response = await fetch(`./${tabName}.html`);
        if (!response.ok) throw new Error(`Plantilla no encontrada: ${tabName}.html`);
        const html = await response.text();
        
        mainContent.innerHTML = html;
        mainContent.style.opacity = '1';

        if (views[tabName]) {
            const module = await views[tabName]();
            const formatNormal = `initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`;
            const initFn = module[formatNormal];

            if (typeof initFn === 'function') {
                console.log(`✅ Vista Activa: ${tabName}`);
                await initFn();
            }
        }
    } catch (error) {
        console.error(`❌ Error en [${tabName}]:`, error);
        mainContent.style.opacity = '1';
    }
}

/**
 * Inicialización completa de la App (Sockets)
 */
export function initializeFullApp() {
    if (socket && socket.connected) return; 

    socket = io(BACKEND_URL, { 
        path: '/socket.io',
        reconnection: true,
        transports: ['websocket']
    });

    socket.on('connect', () => {
        console.log('Real-time: Connected');
        updateConnectionStatusBall('API_SUCCESS');
        socket.emit('get-bot-state');
    });

    // 1. Datos de Mercado
    socket.on('marketData', (data) => {
        updateBotUI({ price: data.price });
        updatePriceHeader(data);
    });

    // 2. Estado Global
    socket.on('bot-state-update', (state) => {
        updateBotUI(state);
    });

    // 3. Stats rápidas
    socket.on('bot-stats', (data) => {
        updateBotUI({ total_profit: data.totalProfit });
    });

    // 4. Balances
    socket.on('balance-real-update', (data) => {
        updateConnectionStatusBall(data.source);
        updateBotUI({
            lastAvailableUSDT: data.lastAvailableUSDT,
            lastAvailableBTC: data.lastAvailableBTC
        });
    });

    // --- 5. ESCUCHA DE LOGS (Restaurado) ---
    socket.on('bot-log', (log) => {
        logQueue.push(log);
        if (logQueue.length > 20) logQueue.shift();
        if (!isProcessingLog) processNextLog();
    });

    setupNavTabs(initializeTab);
}

/**
 * Helper para el header de precios
 */
function updatePriceHeader(data) {
    const percentEl = document.getElementById('price-percent');
    const iconEl = document.getElementById('price-icon');
    if (percentEl && data.priceChangePercent !== undefined) {
        const change = parseFloat(data.priceChangePercent);
        const isUp = change >= 0;
        percentEl.textContent = `${Math.abs(change).toFixed(2)}%`;
        percentEl.style.color = isUp ? '#34d399' : '#f87171';
        if (iconEl) {
            iconEl.className = `fas ${isUp ? 'fa-caret-up' : 'fa-caret-down'}`;
            iconEl.style.color = isUp ? '#34d399' : '#f87171';
        }
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