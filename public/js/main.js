// public/js/main.js

import { setupNavTabs } from './modules/navigation.js';
import { initializeAppEvents, updateLoginIcon } from './modules/appEvents.js';
import { updateBotBalances } from './modules/balance.js';

export const BACKEND_URL = 'https://bsb-ppex.onrender.com';
export const TRADE_SYMBOL_TV = 'BTCUSDT';
export const TRADE_SYMBOL_BITMART = 'BTC_USDT';

export let currentChart = null;
export let intervals = {};
export let socket = null;

// Variables globales para lógica de UI
let lastPrice = 0;
let logQueue = [];
let isProcessingLog = false;

// Registro de módulos para carga dinámica
const views = {
    dashboard: () => import('./modules/dashboard.js'),
    autobot: () => import('./modules/autobot.js'),
    aibot: () => import('./modules/aibot.js')
};

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
        logEl.style.opacity = '1';

        setTimeout(() => {
            logEl.style.opacity = '0.5';
            processNextLog();
        }, 2500);
    } else {
        isProcessingLog = false;
    }
}

/**
 * CARGA UNIFICADA: Esta es la única función que descarga el HTML y activa el JS.
 */
export async function initializeTab(tabName) {
    // 1. Limpieza de procesos anteriores para no saturar la memoria
    Object.values(intervals).forEach(clearInterval);
    intervals = {};
    
    if (window.currentChart && typeof window.currentChart.remove === 'function') {
        window.currentChart.remove();
        window.currentChart = null;
    }

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    // Efecto visual suave de carga
    mainContent.style.opacity = '0.5';

    try {
        // 2. Traer el HTML de la vista
        const response = await fetch(`./${tabName}.html`);
        if (!response.ok) throw new Error(`Plantilla no encontrada: ${tabName}.html`);
        const html = await response.text();
        
        // 3. Inyectar el HTML (Solo una vez aquí)
        mainContent.innerHTML = html;
        mainContent.style.opacity = '1';

        // 4. Activar la lógica de JavaScript para esa pestaña
        if (views[tabName]) {
            const module = await views[tabName]();
            const formatNormal = `initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`;
            const formatUpper = `initialize${tabName.toUpperCase()}View`;

            const initFn = module[formatNormal] || module[formatUpper];

            if (typeof initFn === 'function') {
                console.log(`✅ Iniciando vista: ${tabName}`);
                await initFn();
            }
        }
    } catch (error) {
        console.error(`❌ Error al cargar pestaña [${tabName}]:`, error);
        mainContent.innerHTML = `<div class="p-10 text-center text-red-500">Error: ${error.message} <br><button class="mt-4 bg-gray-700 px-4 py-2 rounded" onclick="location.reload()">Reintentar</button></div>`;
        mainContent.style.opacity = '1';
    }
}

/**
 * Gestión de reconexión cuando la pestaña vuelve a estar activa (Wake up)
 */
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        console.log('🔄 Pestaña recuperada: Sincronizando datos...');
        
        // Si el socket se murió, lo reconectamos
        if (!socket || !socket.connected) {
            if (socket) socket.connect();
            else initializeFullApp();
        }

        // Forzamos a que la pestaña actual se refresque para que no se vea "congelada"
        const currentTab = window.location.hash.replace('#', '') || 'dashboard';
        initializeTab(currentTab);
    }
}

/**
 * Inicialización completa de la App (Sockets y Eventos Globales)
 */
export function initializeFullApp() {
    if (socket && socket.connected) return; 

    updateConnectionStatusBall('DISCONNECTED'); 

    // Configuración robusta para móviles y Render
    socket = io(BACKEND_URL, { 
        path: '/socket.io',
        reconnection: true,
        reconnectionAttempts: Infinity, 
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket']
    });

    socket.on('connect', () => {
        console.log('Real-time: Connected');
        updateConnectionStatusBall('API_SUCCESS');
    });

    socket.on('disconnect', (reason) => {
        console.warn('Real-time: Disconnected -', reason);
        updateConnectionStatusBall('DISCONNECTED');
        if (reason === 'io server disconnect' || reason === 'transport close') {
            socket.connect();
        }
    });

    // --- ESCUCHA DE PRECIOS ---
    socket.on('marketData', (data) => {
        const newPrice = parseFloat(data.price);
        if (isNaN(newPrice)) return;

        const auPriceEl = document.getElementById('auprice');
        if (auPriceEl) {
            const formatter = new Intl.NumberFormat('en-US', {
                style: 'currency', currency: 'USD', minimumFractionDigits: 2
            });
            auPriceEl.textContent = formatter.format(newPrice);
            if (lastPrice > 0) {
                auPriceEl.style.setProperty('color', newPrice > lastPrice ? '#34d399' : '#f87171', 'important');
            }
        }

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
        lastPrice = newPrice;
    });

    // --- ESCUCHA DE BENEFICIOS (PROFIT) ---
    socket.on('bot-stats', (data) => {
        const profitEl = document.getElementById('auprofit');
        if (profitEl) {
            const val = parseFloat(data.totalProfit || 0);
            profitEl.textContent = `${val >= 0 ? '+' : '-'}$${Math.abs(val).toFixed(2)}`;
            profitEl.style.setProperty('color', val >= 0 ? '#34d399' : '#f87171', 'important');
        }
    });

    // --- ESCUCHA DE BALANCES ---
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

    // --- ESCUCHA DE LOGS ---
    socket.on('bot-log', (log) => {
        logQueue.push(log);
        if (logQueue.length > 20) logQueue.shift();
        if (!isProcessingLog) processNextLog();
    });

    // Inicializamos las pestañas pasándole la función de carga
    setupNavTabs(initializeTab);
}

// Eventos de vida de la página
document.addEventListener('visibilitychange', handleVisibilityChange);

document.addEventListener('DOMContentLoaded', () => {
    initializeAppEvents(initializeFullApp);
    updateLoginIcon();

    if (localStorage.getItem('token')) {
        initializeFullApp();
    } else {
        initializeTab('dashboard'); 
    }
});