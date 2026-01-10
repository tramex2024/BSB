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
 * Carga el HTML y activa la lógica JS de la pestaña seleccionada
 */
export async function initializeTab(tabName) {
    // 1. Limpiar procesos previos (Intervalos y Gráficos)
    Object.values(intervals).forEach(clearInterval);
    intervals = {};
    
    if (window.currentChart && typeof window.currentChart.remove === 'function') {
        window.currentChart.remove();
        window.currentChart = null;
    }

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    // Efecto de transición: Ocultar
    mainContent.style.opacity = '0';

    try {
        // 2. Cargar el archivo HTML de la pestaña
        const response = await fetch(`./${tabName}.html`);
        if (!response.ok) throw new Error(`Plantilla no encontrada: ${tabName}.html`);
        const html = await response.text();
        
        // Insertar HTML en el contenedor principal
        mainContent.innerHTML = html;
        mainContent.style.opacity = '1';

        // 3. Cargar el módulo JS correspondiente (dashboard.js, autobot.js, aibot.js)
        if (views[tabName]) {
            const module = await views[tabName]();
            
            // Creamos las dos variaciones posibles del nombre de la función
            // Ejemplo para aibot: initializeAibotView y initializeAIBotView
            const formatNormal = `initialize${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}View`;
            const formatUpper = `initialize${tabName.toUpperCase()}View`;

            const initFn = module[formatNormal] || module[formatUpper];

            if (typeof initFn === 'function') {
                console.log(`✅ Inicializando vista: ${tabName}`);
                await initFn();
            } else {
                console.warn(`⚠️ Módulo cargado pero no se encontró la función de inicio (${formatNormal})`);
            }
        }
    } catch (error) {
        console.error(`❌ Error al cargar pestaña [${tabName}]:`, error);
        mainContent.innerHTML = `
            <div class="p-10 text-center">
                <div class="text-red-400 font-bold mb-2">Error de Sistema</div>
                <div class="text-gray-500 text-xs font-mono">${error.message}</div>
                <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg text-xs">Reintentar</button>
            </div>
        `;
        mainContent.style.opacity = '1';
    }
}

/**
 * Inicialización completa de la App (Sockets y Eventos Globales)
 */
export function initializeFullApp() {
    if (socket) return; 

    updateConnectionStatusBall('DISCONNECTED'); 

    socket = io(BACKEND_URL, { 
        path: '/socket.io',
        reconnectionAttempts: 10,
        transports: ['websocket']
    });

    socket.on('connect', () => {
        console.log('Real-time: Connected');
        updateConnectionStatusBall('API_SUCCESS');
    });

    socket.on('disconnect', () => updateConnectionStatusBall('DISCONNECTED'));

    socket.on('marketData', (data) => {
        const newPrice = parseFloat(data.price);
        if (isNaN(newPrice)) return;

        const auPriceEl = document.getElementById('auprice');
        if (auPriceEl) {
            const formatter = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            
            auPriceEl.textContent = formatter.format(newPrice);

            if (lastPrice > 0) {
                if (newPrice > lastPrice) {
                    auPriceEl.style.setProperty('color', '#34d399', 'important');
                } else if (newPrice < lastPrice) {
                    auPriceEl.style.setProperty('color', '#f87171', 'important');
                }
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

    socket.on('bot-stats', (data) => {
        const profitEl = document.getElementById('auprofit');
        if (profitEl) {
            const val = parseFloat(data.totalProfit || 0);
            profitEl.textContent = `${val >= 0 ? '+' : '-'}$${Math.abs(val).toFixed(2)}`;
            profitEl.style.setProperty('color', val >= 0 ? '#34d399' : '#f87171', 'important');
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