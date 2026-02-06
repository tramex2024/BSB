// public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotBalances } from './modules/balance.js';
import { updateBotUI, updateControlsState } from './modules/uiManager.js';

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';

export let currentChart = null;
export let intervals = {};
export let socket = null;

// Variable global para persistencia de estado entre pestañas
export let currentBotState = {
    price: 0,
    lstate: 'STOPPED',
    sstate: 'STOPPED',
    config: {}
};

let lastPrice = 0;
let logQueue = [];
let isProcessingLog = false;

const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),
    aibot: () => import('./modules/aibot.js')
};

/**
 * Actualiza el indicador visual de conexión (Semáforo de 3 estados)
 */
function updateConnectionStatusBall(source) {
    const statusDot = document.getElementById('status-dot'); 
    if (!statusDot) return;
    
    statusDot.className = 'status-dot transition-all duration-500 h-full w-full rounded-full block'; 

    switch (source) {
        case 'API_SUCCESS':
            statusDot.classList.add('status-green');
            statusDot.title = 'Conectado a BitMart';
            break;
        case 'CACHE_FALLBACK':
            statusDot.classList.add('status-purple');
            statusDot.title = 'Caché / Reconectando...';
            break;
        default:
            statusDot.classList.add('status-red');
            statusDot.title = 'Servidor Offline';
    }
}

/**
 * Gestión de Logs Anti-Spam (2.5s de visibilidad)
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
        const colors = { success: 'text-emerald-400', error: 'text-red-400', warning: 'text-yellow-400', info: 'text-blue-400' };
        logEl.className = `transition-opacity duration-300 font-medium ${colors[log.type] || 'text-gray-400'}`;
        logEl.style.opacity = '1';

        setTimeout(() => {
            logEl.style.opacity = '0.5';
            processNextLog();
        }, 2500);
    } else {
        isProcessingLog = false;
    }
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

    mainContent.style.opacity = '0';

    try {
        const response = await fetch(`./${tabName}.html`);
        if (!response.ok) throw new Error("Plantilla no encontrada");
        const html = await response.text();
        
        mainContent.innerHTML = html;
        mainContent.style.opacity = '1';

        if (views[tabName]) {
            const module = await views[tabName](); 
            const initFunctionName = `initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`;

            if (module[initFunctionName]) {
                // Pasamos el estado actual al inicializar la vista para evitar el "salto" visual
                await module[initFunctionName](currentBotState);
            }
        }
    } catch (error) {
        console.error(`Error al cargar ${tabName}:`, error);
        mainContent.innerHTML = `<div class="p-10 text-center text-red-400">Error cargando vista</div>`;
        mainContent.style.opacity = '1';
    }
}

export function initializeFullApp() {
    if (socket) return; 

    updateConnectionStatusBall('DISCONNECTED'); 

    socket = io(BACKEND_URL, { 
        path: '/socket.io',
        reconnectionAttempts: 10,
        transports: ['websocket']
    });

    socket.on('connect', () => {
        updateConnectionStatusBall('API_SUCCESS');
        socket.emit('get-bot-state'); // Pedimos el estado inicial
    });

    socket.on('disconnect', () => updateConnectionStatusBall('DISCONNECTED'));

    // Flujo de precio quirúrgico (Sin afectar botones)
    socket.on('marketData', (data) => {
        const newPrice = parseFloat(data.price);
        if (isNaN(newPrice)) return;

        currentBotState.price = newPrice;
        const auPriceEl = document.getElementById('auprice');
        
        if (auPriceEl) {
            const formatter = new Intl.NumberFormat('en-US', {
                style: 'currency', currency: 'USD',
                minimumFractionDigits: 2, maximumFractionDigits: 2
            });
            
            auPriceEl.textContent = formatter.format(newPrice);
            if (lastPrice > 0) {
                auPriceEl.style.color = newPrice > lastPrice ? '#34d399' : (newPrice < lastPrice ? '#f87171' : '#ffffff');
            }
        }
        lastPrice = newPrice;
    });

    // Mando Único de Sincronización (Solo actualiza cuando el bot cambia de estado)
    socket.on('bot-state-update', (state) => {
        if (state) {
            currentBotState = { ...currentBotState, ...state };
            updateBotUI(currentBotState);
            updateControlsState(currentBotState);
        }
    });

    socket.on('bot-stats', (data) => {
        const profitEl = document.getElementById('auprofit');
        if (profitEl) {
            const val = parseFloat(data.totalProfit || 0);
            profitEl.textContent = `${val >= 0 ? '+' : '-'}$${Math.abs(val).toFixed(2)}`;
            profitEl.style.color = val >= 0 ? '#34d399' : '#f87171';
        }
    });

    socket.on('balance-real-update', (data) => {
        updateConnectionStatusBall(data.source);
        updateBotBalances([
            { currency: 'USDT', available: data.lastAvailableUSDT },
            { currency: 'BTC', available: data.lastAvailableBTC }
        ]);

        const elements = {
            'aubalance-usdt': parseFloat(data.lastAvailableUSDT || 0).toFixed(2),
            'aubalance-btc': parseFloat(data.lastAvailableBTC || 0).toFixed(6),
        };

        Object.entries(elements).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        });
    });

    socket.on('bot-log', (log) => {
        logQueue.push(log);
        if (logQueue.length > 20) logQueue.shift();
        if (!isProcessingLog) processNextLog();
    });

    setupNavTabs(initializeTab);
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