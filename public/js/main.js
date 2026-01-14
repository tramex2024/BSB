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

// --- VARIABLES PARA LOGS (CON LÓGICA DE SALTO) ---
let logQueue = [];
let isProcessingLog = false;
const LOG_DISPLAY_TIME = 2500; 
const MAX_QUEUE_SIZE = 2;      

// --- VARIABLE PARA EL WATCHDOG (CONEXIÓN) ---
let watchdogTimer = null;

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),
    aibot: () => import('./modules/aibot.js')
};

/**
 * Sistema de gestión de Logs
 */
function processNextLog() {
    if (logQueue.length === 0) {
        isProcessingLog = false;
        return;
    }

    if (logQueue.length > MAX_QUEUE_SIZE) {
        logQueue = logQueue.slice(-MAX_QUEUE_SIZE);
    }

    isProcessingLog = true;
    const log = logQueue.shift();
    const logEl = document.getElementById('log-message');

    if (logEl) {
        const colors = {
            success: 'text-emerald-400',
            error: 'text-red-400',
            warning: 'text-yellow-400',
            info: 'text-blue-400'
        };

        logEl.style.opacity = '0';

        setTimeout(() => {
            logEl.textContent = log.message;
            logEl.className = `transition-opacity duration-300 font-medium ${colors[log.type] || 'text-gray-400'}`;
            logEl.style.opacity = '1';

            setTimeout(() => {
                processNextLog();
            }, LOG_DISPLAY_TIME);

        }, 300);
    } else {
        isProcessingLog = false;
    }
}

/**
 * Actualiza el indicador visual de conexión
 */
function updateConnectionStatusBall(status) {
    const statusDot = document.getElementById('status-dot'); 
    if (!statusDot) return;
    
    statusDot.className = 'status-dot transition-all duration-300 h-full w-full rounded-full block'; 

    if (status === 'ONLINE') {
        statusDot.classList.add('status-green');
    } else if (status === 'FALLBACK') {
        statusDot.classList.add('status-purple');
    } else {
        statusDot.classList.add('status-red');
    }
}

/**
 * Reinicia el temporizador de seguridad (Watchdog)
 */
function resetWatchdog() {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
        // Si pasan 1.5s sin recibir marketData, bolita roja.
        updateConnectionStatusBall('OFFLINE');
    }, 1500);
}

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
        const html = await response.text();
        mainContent.innerHTML = html;
        mainContent.style.opacity = '1';

        if (views[tabName]) {
            const module = await views[tabName]();
            const initFn = module[`initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`];
            if (typeof initFn === 'function') await initFn();
        }
    } catch (error) {
        mainContent.style.opacity = '1';
    }
}

export function initializeFullApp() {
    if (socket && socket.connected) return; 

    socket = io(BACKEND_URL, { 
        path: '/socket.io',
        reconnection: true,
        transports: ['websocket']
    });

    // POR DEFECTO: Roja al iniciar
    updateConnectionStatusBall('OFFLINE');

    socket.on('connect', () => {
        socket.emit('get-bot-state');
    });

    // El corazón del sistema: Si llega MarketData con exchangeOnline: true, se pone verde
    socket.on('marketData', (data) => {
        updateBotUI({ price: data.price });
        updatePriceHeader(data);

        if (data.exchangeOnline) {
            updateConnectionStatusBall('ONLINE');
            resetWatchdog(); // Si los datos fluyen, el watchdog no se dispara
        } else {
            updateConnectionStatusBall('OFFLINE');
        }
    });

    socket.on('bot-state-update', (state) => {
        updateBotUI(state);
    });

    socket.on('bot-stats', (data) => {
        updateBotUI({ total_profit: data.totalProfit });
    });

    socket.on('balance-real-update', (data) => {
        // Solo actualizamos a púrpura si realmente estamos en fallback, 
        // pero la salud general la manda el marketData
        if (data.source === 'CACHE_FALLBACK') updateConnectionStatusBall('FALLBACK');
        updateBotUI({
            lastAvailableUSDT: data.lastAvailableUSDT,
            lastAvailableBTC: data.lastAvailableBTC
        });
    });

    socket.on('bot-log', (log) => {
        logQueue.push(log);
        if (!isProcessingLog) processNextLog();
    });

    socket.on('disconnect', () => {
        updateConnectionStatusBall('OFFLINE');
    });

    setupNavTabs(initializeTab);
}

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